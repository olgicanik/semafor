import base64
import requests
import json
import socket
import os
import logging

# Configuration - read from environment variables
TAC_URL = os.environ["TAC_URL"]
TAC_USERNAME = os.environ["TAC_USERNAME"]
TAC_PASSWORD = os.environ["TAC_PASSWORD"]

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def get_status(tac_url, username, password):
    json_txt = {   'actionName': 'listTasks',   'authPass': password,   'authUser': username }
    json_string = json.dumps(json_txt)
    encoded_bytes = base64.b64encode(json_string.encode('utf-8'))
    encoded_string = encoded_bytes.decode('utf-8')

    encoded_url = f"{tac_url}?{encoded_string}"

    logging.info(f"Request URL: {encoded_url}")

    try:
        response = requests.get(encoded_url, verify=False)  # Disable SSL Verification for testing
        logging.info(f"Response: {response}")
        response.raise_for_status()

        data = response.json()
        logging.info(f"Data: {data}")
        return data

    except requests.exceptions.RequestException as e:
        logging.error(f"Error: Connection to TAC failed: {e}")
        return None
    except json.JSONDecodeError as e:
        logging.error(f"Error: Failed to decode JSON response: {e}")
        logging.error(f"Response text: {response.text}")
        return None
    except Exception as e:
        logging.error(f"An unexpected error occurred: {e}")
        return None


def main():
    jobserver_list = get_status(TAC_URL, TAC_USERNAME, TAC_PASSWORD)


if __name__ == "__main__":
    main()
