"""Run the two bundled cases through the same API routes used by the atlas."""
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))
from app.main import app


def main():
    with TestClient(app) as client:
        seed = client.get("/api/v1/allocation/demo")
        seed.raise_for_status()
        for phase in ("mitigation", "response"):
            scenario = {**seed.json()["data"], "phase": phase}
            response = client.post("/api/v1/allocation/plans/compare", json=scenario)
            response.raise_for_status()
            result = response.json()["data"]
            print(f"\n{result['scenarioLabel']} | illustrative scenario v{result['scenarioVersion']}")
            print("Strategy       Health U   Shelter U   Access    Spend   Crews   Selected links")
            for plan in result["strategies"]:
                links = ", ".join(action["assetId"] for action in plan["interventions"]) or "none"
                print(f"{plan['id']:<13} {plan['utilities']['health']:8.2f} {plan['utilities']['shelter']:11.2f}"
                      f" {plan['weightedAccess']:8.1%} {sum(plan['spend'].values()):8} {plan['crewsUsed']:7}   {links}")
            print(f"Verified independent outcome = {result['equilibriumVerified']}; bargaining agreement = {result['agreement']}")


if __name__ == "__main__":
    main()
