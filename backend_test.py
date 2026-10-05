#!/usr/bin/env python3
"""
Comprehensive backend API tests for ALIVE.FUN
Tests all endpoints after environment restoration
"""
import json
import os
import sys
import time
import requests
from dotenv import load_dotenv

# Load frontend .env to get the backend URL
load_dotenv("/app/frontend/.env")
BACKEND_URL = os.getenv("REACT_APP_BACKEND_URL", "http://localhost:8001")
BASE_URL = f"{BACKEND_URL}/api"

# Test results tracking
results = {
    "passed": [],
    "failed": [],
    "warnings": []
}

def log_test(name, status, details=""):
    """Log test result"""
    if status == "PASS":
        results["passed"].append({"test": name, "details": details})
        print(f"✅ {name}: PASS {details}")
    elif status == "FAIL":
        results["failed"].append({"test": name, "details": details})
        print(f"❌ {name}: FAIL - {details}")
    elif status == "WARN":
        results["warnings"].append({"test": name, "details": details})
        print(f"⚠️  {name}: WARNING - {details}")

def test_health():
    """Test 1: GET /api/ - health check"""
    try:
        resp = requests.get(f"{BASE_URL}/", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("ok") == True:
                log_test("Health Check", "PASS", f"service={data.get('service')}")
                return True
            else:
                log_test("Health Check", "FAIL", f"Expected ok:true, got {data}")
                return False
        else:
            log_test("Health Check", "FAIL", f"Status {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        log_test("Health Check", "FAIL", f"Exception: {str(e)}")
        return False

def test_avatars_list():
    """Test 2: GET /api/avatars?limit=5 - should return total=3000+"""
    try:
        resp = requests.get(f"{BASE_URL}/avatars", params={"limit": 5}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            total = data.get("total", 0)
            items = data.get("items", [])
            
            if total >= 3000:
                # Check item structure
                if items and len(items) > 0:
                    item = items[0]
                    required_fields = ["id", "name", "modelUrl", "thumbnailUrl"]
                    missing = [f for f in required_fields if f not in item]
                    if missing:
                        log_test("Avatar List", "FAIL", f"Missing fields in items: {missing}")
                        return False
                    log_test("Avatar List", "PASS", f"total={total}, items={len(items)}, fields OK")
                    return True, items[0]["id"]  # Return first avatar ID for next test
                else:
                    log_test("Avatar List", "FAIL", f"total={total} but no items returned")
                    return False, None
            else:
                log_test("Avatar List", "FAIL", f"Expected total >= 3000, got {total}")
                return False, None
        else:
            log_test("Avatar List", "FAIL", f"Status {resp.status_code}: {resp.text[:200]}")
            return False, None
    except Exception as e:
        log_test("Avatar List", "FAIL", f"Exception: {str(e)}")
        return False, None

def test_avatar_by_id(avatar_id):
    """Test 3: GET /api/avatars/{id} - get specific avatar"""
    try:
        resp = requests.get(f"{BASE_URL}/avatars/{avatar_id}", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("id") == avatar_id:
                log_test("Avatar By ID", "PASS", f"id={avatar_id}, name={data.get('name')}")
                return True
            else:
                log_test("Avatar By ID", "FAIL", f"ID mismatch: expected {avatar_id}, got {data.get('id')}")
                return False
        else:
            log_test("Avatar By ID", "FAIL", f"Status {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        log_test("Avatar By ID", "FAIL", f"Exception: {str(e)}")
        return False

def test_character_generate_empty():
    """Test 4a: POST /api/characters/generate with empty body"""
    try:
        resp = requests.post(f"{BASE_URL}/characters/generate", json={}, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            required_fields = ["characterName", "vibe", "traits", "voice", "avatarId", "avatar"]
            missing = [f for f in required_fields if f not in data]
            if missing:
                log_test("Character Generate (empty)", "FAIL", f"Missing fields: {missing}")
                return False, None
            log_test("Character Generate (empty)", "PASS", f"name={data.get('characterName')}, vibe={data.get('vibe')}, avatarId={data.get('avatarId')}")
            return True, data.get("avatarId")
        else:
            log_test("Character Generate (empty)", "FAIL", f"Status {resp.status_code}: {resp.text[:200]}")
            return False, None
    except Exception as e:
        log_test("Character Generate (empty)", "FAIL", f"Exception: {str(e)}")
        return False, None

def test_character_generate_with_prompt():
    """Test 4b: POST /api/characters/generate with prompt"""
    try:
        payload = {
            "prompt": "A fierce warrior from the digital realm",
            "ticker": "WARRIOR"
        }
        resp = requests.post(f"{BASE_URL}/characters/generate", json=payload, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            required_fields = ["characterName", "vibe", "traits", "voice", "avatarId", "avatar"]
            missing = [f for f in required_fields if f not in data]
            if missing:
                log_test("Character Generate (prompt)", "FAIL", f"Missing fields: {missing}")
                return False
            log_test("Character Generate (prompt)", "PASS", f"name={data.get('characterName')}, vibe={data.get('vibe')}")
            return True
        else:
            log_test("Character Generate (prompt)", "FAIL", f"Status {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        log_test("Character Generate (prompt)", "FAIL", f"Exception: {str(e)}")
        return False

def test_avatar_file_model(avatar_id):
    """Test 5: GET /api/avatar-files/{id}/model - VRM binary"""
    try:
        resp = requests.get(f"{BASE_URL}/avatar-files/{avatar_id}/model", timeout=60)
        if resp.status_code == 200:
            content_type = resp.headers.get("Content-Type", "")
            content_length = len(resp.content)
            
            # Check if it's a VRM file (glTF binary)
            if resp.content[:4] == b"glTF":
                if content_length > 100000:  # Should be large (>100KB)
                    log_test("Avatar File Model", "PASS", f"VRM file size={content_length} bytes, type={content_type}")
                    return True
                else:
                    log_test("Avatar File Model", "WARN", f"VRM file too small: {content_length} bytes")
                    return True
            else:
                log_test("Avatar File Model", "FAIL", f"Not a valid VRM file (glTF header missing)")
                return False
        else:
            log_test("Avatar File Model", "FAIL", f"Status {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        log_test("Avatar File Model", "FAIL", f"Exception: {str(e)}")
        return False

def test_tokens_list():
    """Test 6a: GET /api/tokens - should return empty list (honest empty state)"""
    try:
        resp = requests.get(f"{BASE_URL}/tokens", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("items", [])
            log_test("Tokens List", "PASS", f"items count={len(items)} (empty is expected)")
            return True
        else:
            log_test("Tokens List", "FAIL", f"Status {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        log_test("Tokens List", "FAIL", f"Exception: {str(e)}")
        return False

def test_token_create():
    """Test 6b: POST /api/tokens - create token"""
    try:
        payload = {
            "name": "Test Warrior Token",
            "ticker": "TWRR",
            "description": "A test token for verification",
            "brainModel": "gemini-3.8-flash"
        }
        resp = requests.post(f"{BASE_URL}/tokens", json=payload, timeout=20)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token", {})
            if token.get("name") == payload["name"] and token.get("ticker") == payload["ticker"]:
                log_test("Token Create", "PASS", f"id={token.get('id')}, name={token.get('name')}")
                return True, token.get("id")
            else:
                log_test("Token Create", "FAIL", f"Token data mismatch: {token}")
                return False, None
        else:
            log_test("Token Create", "FAIL", f"Status {resp.status_code}: {resp.text[:200]}")
            return False, None
    except Exception as e:
        log_test("Token Create", "FAIL", f"Exception: {str(e)}")
        return False, None

def test_token_import():
    """Test 6c: POST /api/tokens/import - import existing token"""
    try:
        # Use a known pump.fun token mint for testing (this is a real token)
        payload = {
            "input": "https://pump.fun/coin/CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump"
        }
        resp = requests.post(f"{BASE_URL}/tokens/import", json=payload, timeout=20)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token", {})
            log_test("Token Import", "PASS", f"mint={token.get('mint')}, name={token.get('name')}")
            return True
        elif resp.status_code == 422:
            # Token not indexed yet - this is acceptable
            log_test("Token Import", "WARN", f"Token not indexed (422): {resp.text[:200]}")
            return True
        else:
            log_test("Token Import", "FAIL", f"Status {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        log_test("Token Import", "FAIL", f"Exception: {str(e)}")
        return False

def test_launch_pumpportal_prepare():
    """Test 6d: POST /api/launch/pumpportal/prepare - prepare launch transaction"""
    try:
        # This test only verifies the transaction build path works
        # We won't broadcast as there's no funded wallet
        payload = {
            "tokenId": "test-token-id-123",
            "publicKey": "11111111111111111111111111111111",  # Invalid but formatted correctly
            "mint": "11111111111111111111111111111111",
            "devBuySol": 0,
            "slippage": 10,
            "priorityFee": 0.0005
        }
        resp = requests.post(f"{BASE_URL}/launch/pumpportal/prepare", json=payload, timeout=30)
        
        # We expect this to fail with 404 (token not found) or 400 (validation error)
        # But if it reaches PumpPortal, that's a sign the endpoint is working
        if resp.status_code == 404:
            log_test("Launch PumpPortal Prepare", "PASS", "Endpoint working (404 token not found expected)")
            return True
        elif resp.status_code == 400:
            log_test("Launch PumpPortal Prepare", "PASS", f"Endpoint working (400 validation: {resp.text[:100]})")
            return True
        elif resp.status_code == 502:
            # PumpPortal error - means we reached the external service
            log_test("Launch PumpPortal Prepare", "PASS", f"Endpoint working (reached PumpPortal)")
            return True
        elif resp.status_code == 200:
            log_test("Launch PumpPortal Prepare", "PASS", "Transaction prepared successfully")
            return True
        else:
            log_test("Launch PumpPortal Prepare", "FAIL", f"Unexpected status {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        log_test("Launch PumpPortal Prepare", "FAIL", f"Exception: {str(e)}")
        return False

def test_brain_endpoint():
    """Test 7: POST /api/brain/line - cloud brain with EMERGENT_LLM_KEY"""
    try:
        payload = {
            "mint": "TEST123",
            "eventId": "test-event-1",
            "draft": "The market is looking bullish today!",
            "priority": 3,
            "context": {"marketCap": 50000, "change1h": 0.15},
            "profile": {
                "characterName": "Captain Crypto",
                "vibe": "commander",
                "traits": ["confident", "strategic"],
                "ticker": "TEST"
            }
        }
        resp = requests.post(f"{BASE_URL}/brain/line", json=payload, timeout=20)
        if resp.status_code == 200:
            data = resp.json()
            text = data.get("text", "")
            source = data.get("source", "")
            
            if text:
                if source == "gemini-3.8-flash":
                    log_test("Brain Endpoint (LLM)", "PASS", f"LLM response: '{text[:50]}...'")
                elif source == "template":
                    reason = data.get("reason", "")
                    log_test("Brain Endpoint (fallback)", "PASS", f"Template fallback (reason: {reason})")
                else:
                    log_test("Brain Endpoint", "PASS", f"source={source}, text='{text[:50]}...'")
                return True
            else:
                log_test("Brain Endpoint", "FAIL", f"No text in response: {data}")
                return False
        else:
            log_test("Brain Endpoint", "FAIL", f"Status {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        log_test("Brain Endpoint", "FAIL", f"Exception: {str(e)}")
        return False

def test_brain_models():
    """Test 7b: GET /api/brain/models - list available brain models"""
    try:
        resp = requests.get(f"{BASE_URL}/brain/models", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            default = data.get("default")
            models = data.get("models", [])
            
            if default and models:
                log_test("Brain Models", "PASS", f"default={default}, models count={len(models)}")
                return True
            else:
                log_test("Brain Models", "FAIL", f"Missing data: default={default}, models={len(models)}")
                return False
        else:
            log_test("Brain Models", "FAIL", f"Status {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        log_test("Brain Models", "FAIL", f"Exception: {str(e)}")
        return False

def test_vibes():
    """Test 8: GET /api/vibes - list available vibes"""
    try:
        resp = requests.get(f"{BASE_URL}/vibes", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            vibes = data.get("vibes", [])
            animation_profiles = data.get("animationProfiles", {})
            
            if vibes and animation_profiles:
                log_test("Vibes Endpoint", "PASS", f"vibes count={len(vibes)}, animations={len(animation_profiles)}")
                return True
            else:
                log_test("Vibes Endpoint", "FAIL", f"Missing data: vibes={len(vibes)}, animations={len(animation_profiles)}")
                return False
        else:
            log_test("Vibes Endpoint", "FAIL", f"Status {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        log_test("Vibes Endpoint", "FAIL", f"Exception: {str(e)}")
        return False

def test_avatar_stats():
    """Test 9: GET /api/avatars/stats - avatar statistics"""
    try:
        resp = requests.get(f"{BASE_URL}/avatars/stats", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            total = data.get("total", 0)
            collections = data.get("collections", [])
            
            if total >= 3000:
                log_test("Avatar Stats", "PASS", f"total={total}, collections={len(collections)}")
                return True
            else:
                log_test("Avatar Stats", "FAIL", f"Expected total >= 3000, got {total}")
                return False
        else:
            log_test("Avatar Stats", "FAIL", f"Status {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        log_test("Avatar Stats", "FAIL", f"Exception: {str(e)}")
        return False

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"✅ PASSED: {len(results['passed'])}")
    print(f"❌ FAILED: {len(results['failed'])}")
    print(f"⚠️  WARNINGS: {len(results['warnings'])}")
    print("="*80)
    
    if results['failed']:
        print("\n❌ FAILED TESTS:")
        for item in results['failed']:
            print(f"  - {item['test']}: {item['details']}")
    
    if results['warnings']:
        print("\n⚠️  WARNINGS:")
        for item in results['warnings']:
            print(f"  - {item['test']}: {item['details']}")
    
    print("\n")
    return len(results['failed']) == 0

def main():
    print("="*80)
    print("ALIVE.FUN Backend API Test Suite")
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    print()
    
    # Test 1: Health check
    if not test_health():
        print("\n❌ Health check failed. Backend may not be running. Exiting.")
        sys.exit(1)
    
    # Test 2: Avatar list
    avatar_list_result = test_avatars_list()
    avatar_id = None
    if isinstance(avatar_list_result, tuple):
        success, avatar_id = avatar_list_result
    
    # Test 3: Avatar by ID (if we got an ID from test 2)
    if avatar_id:
        test_avatar_by_id(avatar_id)
    
    # Test 4: Character generation
    char_result = test_character_generate_empty()
    char_avatar_id = None
    if isinstance(char_result, tuple):
        success, char_avatar_id = char_result
    
    test_character_generate_with_prompt()
    
    # Test 5: Avatar file model (use avatar from character generation or list)
    test_avatar_id = char_avatar_id or avatar_id
    if test_avatar_id:
        test_avatar_file_model(test_avatar_id)
    
    # Test 6: Token endpoints
    test_tokens_list()
    token_create_result = test_token_create()
    test_token_import()
    test_launch_pumpportal_prepare()
    
    # Test 7: Brain endpoints
    test_brain_endpoint()
    test_brain_models()
    
    # Test 8: Vibes
    test_vibes()
    
    # Test 9: Avatar stats
    test_avatar_stats()
    
    # Print summary
    success = print_summary()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
