# scripts/encrypt_env.py
# usage: python scripts/encrypt_env.py --password 12345 '{"TAC_PASSWORD_1": "secret", ...}'
import sys, json, argparse, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from app.secrets_env import encrypt_value, _derive_key

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--password", default="12345")
    ap.add_argument("json", help="JSON object of secrets")
    args = ap.parse_args()
    key = _derive_key(args.password)
    for k, v in json.loads(args.json).items():
        print(f"{k.upper()}_ENCRYPTED={encrypt_value(str(v), key)}")

if __name__ == "__main__":
    main()
