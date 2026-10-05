#!/usr/bin/env python3
"""
Additional endpoint tests for ALIVE.FUN
Testing market snapshots, token events, and other specific endpoints
"""
import json
import os
import sys
import requests
from dotenv import load_dotenv

# Load frontend .env to get the backend URL
load_dotenv("/app/frontend/.env")
BACKEND_URL = os.getenv("REACT_APP_BACKEND_URL", "http://localhost:8001")
BASE_URL = f"{BACKEND_URL}/api"

def test_token_get_by_id(token_id):
    """Test GET /api/tokens/{id} - get token details"""
    try:
        resp = requests.get(f"{BASE_URL}/tokens/{token_id}", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token", {})
            profile = data.get("profile", {})
            avatar = data.get("avatar", {})
            
            print(f"✅ Token Get By ID: PASS")
            print(f"   - token: {token.get('name')} ({token.get('ticker')})")
            print(f"   - profile: {profile.get('characterName') if profile else 'None'}")
            print(f"   - avatar: {avatar.get('name') if avatar else 'None'}")
            return True, token.get("mint")
        else:
            print(f"❌ Token Get By ID: FAIL - Status {resp.status_code}: {resp.text[:200]}")
            return False, None
    except Exception as e:
        print(f"❌ Token Get By ID: FAIL - Exception: {str(e)}")
        return False, None

def test_token_events(token_id):
    """Test GET /api/tokens/{id}/events - get token events"""
    try:
        resp = requests.get(f"{BASE_URL}/tokens/{token_id}/events", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("items", [])
            print(f"✅ Token Events: PASS - {len(items)} events")
            return True
        else:
            print(f"❌ Token Events: FAIL - Status {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Token Events: FAIL - Exception: {str(e)}")
        return False

def test_token_metadata(token_id):
    """Test GET /api/tokens/{id}/metadata.json - token metadata"""
    try:
        resp = requests.get(f"{BASE_URL}/tokens/{token_id}/metadata.json", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            print(f"✅ Token Metadata: PASS")
            print(f"   - name: {data.get('name')}")
            print(f"   - symbol: {data.get('symbol')}")
            print(f"   - description: {data.get('description', '')[:50]}...")
            return True
        else:
            print(f"❌ Token Metadata: FAIL - Status {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Token Metadata: FAIL - Exception: {str(e)}")
        return False

def test_launch_status(token_id):
    """Test GET /api/launch/status/{token_id} - launch status"""
    try:
        resp = requests.get(f"{BASE_URL}/launch/status/{token_id}", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            print(f"✅ Launch Status: PASS")
            print(f"   - status: {data.get('status')}")
            print(f"   - mint: {data.get('mint')}")
            return True
        else:
            print(f"❌ Launch Status: FAIL - Status {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Launch Status: FAIL - Exception: {str(e)}")
        return False

def test_user_wallet():
    """Test POST /api/users/wallet - register wallet"""
    try:
        # Use a valid Solana wallet format
        payload = {
            "wallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
        }
        resp = requests.post(f"{BASE_URL}/users/wallet", json=payload, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("ok"):
                print(f"✅ User Wallet: PASS")
                return True
            else:
                print(f"❌ User Wallet: FAIL - Expected ok:true, got {data}")
                return False
        else:
            print(f"❌ User Wallet: FAIL - Status {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ User Wallet: FAIL - Exception: {str(e)}")
        return False

def test_lab_session():
    """Test POST /api/lab/session - create lab session"""
    try:
        payload = {"marketCap": 50000}
        resp = requests.post(f"{BASE_URL}/lab/session", json=payload, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            mint = data.get("mint")
            state = data.get("state", {})
            
            if mint and mint.startswith("LAB"):
                print(f"✅ Lab Session: PASS")
                print(f"   - mint: {mint}")
                print(f"   - marketCap: {state.get('marketCap')}")
                return True, mint
            else:
                print(f"❌ Lab Session: FAIL - Invalid mint: {mint}")
                return False, None
        else:
            print(f"❌ Lab Session: FAIL - Status {resp.status_code}: {resp.text[:200]}")
            return False, None
    except Exception as e:
        print(f"❌ Lab Session: FAIL - Exception: {str(e)}")
        return False, None

def test_simulate(mint):
    """Test POST /api/sim/{mint} - simulate market action"""
    try:
        payload = {
            "action": "buy",
            "value": 1000
        }
        resp = requests.post(f"{BASE_URL}/sim/{mint}", json=payload, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("ok"):
                print(f"✅ Simulate: PASS - action={payload['action']}")
                return True
            else:
                print(f"❌ Simulate: FAIL - Expected ok:true, got {data}")
                return False
        else:
            print(f"❌ Simulate: FAIL - Status {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Simulate: FAIL - Exception: {str(e)}")
        return False

def test_avatar_file_thumbnail(avatar_id):
    """Test GET /api/avatar-files/{id}/thumbnail if it exists"""
    try:
        resp = requests.get(f"{BASE_URL}/avatar-files/{avatar_id}/thumbnail", timeout=10)
        if resp.status_code == 200:
            print(f"✅ Avatar Thumbnail: PASS - size={len(resp.content)} bytes")
            return True
        elif resp.status_code == 404:
            print(f"⚠️  Avatar Thumbnail: Not implemented (404) - this is OK")
            return True
        else:
            print(f"⚠️  Avatar Thumbnail: Status {resp.status_code}")
            return True
    except Exception as e:
        print(f"⚠️  Avatar Thumbnail: Exception: {str(e)}")
        return True

def main():
    print("="*80)
    print("ALIVE.FUN Additional Backend Tests")
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    print()
    
    passed = 0
    failed = 0
    
    # First, create a token to test with
    print("Creating test token...")
    try:
        resp = requests.post(f"{BASE_URL}/tokens", json={
            "name": "Test Market Token",
            "ticker": "TMKT",
            "description": "Token for market testing",
            "brainModel": "gemini-3.8-flash"
        }, timeout=20)
        
        if resp.status_code == 200:
            data = resp.json()
            token_id = data.get("token", {}).get("id")
            print(f"✅ Created test token: {token_id}\n")
            
            # Test token endpoints
            if test_token_get_by_id(token_id)[0]:
                passed += 1
            else:
                failed += 1
            
            if test_token_events(token_id):
                passed += 1
            else:
                failed += 1
            
            if test_token_metadata(token_id):
                passed += 1
            else:
                failed += 1
            
            if test_launch_status(token_id):
                passed += 1
            else:
                failed += 1
        else:
            print(f"❌ Failed to create test token: {resp.status_code}\n")
            failed += 4
    except Exception as e:
        print(f"❌ Failed to create test token: {str(e)}\n")
        failed += 4
    
    # Test user wallet
    if test_user_wallet():
        passed += 1
    else:
        failed += 1
    
    # Test lab session and simulation
    lab_result = test_lab_session()
    if isinstance(lab_result, tuple):
        success, mint = lab_result
        if success:
            passed += 1
            if mint:
                if test_simulate(mint):
                    passed += 1
                else:
                    failed += 1
        else:
            failed += 1
    
    # Test avatar thumbnail (optional endpoint)
    test_avatar_file_thumbnail("0x3999877754904d8542ad1845d368fa01a5e6e9a5-1")
    
    # Summary
    print("\n" + "="*80)
    print("ADDITIONAL TESTS SUMMARY")
    print("="*80)
    print(f"✅ PASSED: {passed}")
    print(f"❌ FAILED: {failed}")
    print("="*80)
    
    sys.exit(0 if failed == 0 else 1)

if __name__ == "__main__":
    main()
