"""Flood-aware emergency routing.

* Point-to-point: NetworkX A* (haversine heuristic) on a MultiGraph whose edge weights are
  re-computed per scenario. Edges deeper than the vehicle's safe wading depth are removed
  (weight None == infinite); shallower water slows traffic quadratically.
* Network-wide access: SciPy single-source Dijkstra from the hospital gives response time to
  every intersection (and so to every building) in a few milliseconds.

The graph is treated as undirected: emergency vehicles may run against one-way traffic.
"""
from __future__ import annotations

import math

import networkx as nx
import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

WET_M = 0.03  # below this, water does not affect driving


def edge_weights(base_time: np.ndarray, depth: np.ndarray, clearance: float) -> np.ndarray:
    """Travel time (s) per edge under flooding; +inf where impassable."""
    r = np.clip(depth, 0, None) / clearance
    w = base_time * (1.0 + 4.0 * r**2)
    w = np.where(depth < WET_M, base_time, w)
    return np.where(depth > clearance, np.inf, w)


class Router:
    def __init__(self, ui, vi, base_time, length, node_xy, geoms):
        self.ui = np.asarray(ui)
        self.vi = np.asarray(vi)
        self.base_time = np.asarray(base_time, dtype=np.float64)
        self.length = np.asarray(length, dtype=np.float64)
        self.node_xy = node_xy
        self.geoms = geoms  # list of (n,2) coordinate arrays, oriented ui -> vi
        self.n_nodes = len(node_xy)
        self.G = nx.MultiGraph()
        self.G.add_nodes_from(range(self.n_nodes))
        self.G.add_edges_from((int(u), int(v), i, {"i": i}) for i, (u, v) in enumerate(zip(self.ui, self.vi)))
        # fastest plausible speed for an admissible A* heuristic
        self.vmax = float(np.max(self.length / np.maximum(self.base_time, 1e-6)))
        self._lat_k = math.cos(math.radians(float(np.mean(node_xy[:, 1]))))

    # -- heuristics / weights -------------------------------------------------
    def _h(self, a, b):
        (x1, y1), (x2, y2) = self.node_xy[a], self.node_xy[b]
        dx = (x2 - x1) * self._lat_k * 111_320.0
        dy = (y2 - y1) * 111_320.0
        return math.hypot(dx, dy) / self.vmax

    def _weight_fn(self, w):
        def fn(u, v, d):
            best = min(w[attr["i"]] for attr in d.values())
            return None if best == math.inf else best

        return fn

    def _edges_on_path(self, nodes, w):
        out = []
        for a, b in zip(nodes[:-1], nodes[1:]):
            cands = self.G.get_edge_data(a, b)
            i = min((attr["i"] for attr in cands.values()), key=lambda j: w[j])
            out.append((i, self.ui[i] == a))
        return out

    def _path_coords(self, edge_seq):
        coords = []
        for i, forward in edge_seq:
            g = self.geoms[i] if forward else self.geoms[i][::-1]
            coords.extend(g if not coords else g[1:])
        return coords

    # -- public ---------------------------------------------------------------
    def route(self, src: int, dst: int, w: np.ndarray):
        try:
            nodes = nx.astar_path(self.G, src, dst, heuristic=self._h, weight=self._weight_fn(w))
        except nx.NetworkXNoPath:
            return None
        seq = self._edges_on_path(nodes, w)
        idx = [i for i, _ in seq]
        return dict(
            edges=idx,
            coords=self._path_coords(seq),
            time_s=float(sum(w[i] for i in idx)),
            length_m=float(self.length[idx].sum()),
        )

    def access_times(self, src: int, w: np.ndarray) -> np.ndarray:
        """Shortest travel time (s) from src to every node; inf if cut off."""
        ok = np.isfinite(w)
        u, v, ww = self.ui[ok], self.vi[ok], w[ok]
        # keep only the fastest of any parallel edges (csr would otherwise sum duplicates)
        a, b = np.minimum(u, v), np.maximum(u, v)
        order = np.lexsort((ww, b, a))
        a, b, ww = a[order], b[order], ww[order]
        first = np.ones(len(a), dtype=bool)
        first[1:] = (a[1:] != a[:-1]) | (b[1:] != b[:-1])
        a, b, ww = a[first], b[first], ww[first]
        M = csr_matrix((np.maximum(ww, 1e-6), (a, b)), shape=(self.n_nodes, self.n_nodes))
        return dijkstra(M, directed=False, indices=src)
