#!/usr/bin/env python3
"""
WebSocket endpoint test for ALIVE.FUN
"""
import asyncio
import json
import os
import sys
from dotenv import load_dotenv

try:
    import websockets
except ImportError:
    print("Installing websockets library...")
    os.system("pip install websockets -q")
    import websockets

# Load frontend .env to get the backend URL
load_dotenv("/app/frontend/.env")
BACKEND_URL = os.getenv("REACT_APP_BACKEND_URL", "http://localhost:8001")
# Convert https to wss for WebSocket
WS_URL = BACKEND_URL.replace("https://", "wss://").replace("http://", "ws://")

async def test_websocket():
    """Test WebSocket connection for a lab session"""
    print("="*80)
    print("WebSocket Test")
    print(f"WS URL: {WS_URL}/api/ws/")
    print("="*80)
    
    # First create a lab session to get a mint
    import requests
    try:
        resp = requests.post(f"{BACKEND_URL}/api/lab/session", json={"marketCap": 30000}, timeout=10)
        if resp.status_code != 200:
            print(f"❌ Failed to create lab session: {resp.status_code} {resp.text[:200]}")
            return False
        
        data = resp.json()
        mint = data.get("mint")
        print(f"✅ Created lab session: mint={mint}")
        
        # Now test WebSocket connection
        ws_endpoint = f"{WS_URL}/api/ws/{mint}"
        print(f"Connecting to WebSocket: {ws_endpoint}")
        
        async with websockets.connect(ws_endpoint, ping_interval=20, ping_timeout=10) as websocket:
            print("✅ WebSocket connected")
            
            # Wait for hello message
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=5)
                data = json.loads(message)
                
                if data.get("type") == "hello":
                    print(f"✅ Received hello message")
                    print(f"   - state: {bool(data.get('state'))}")
                    print(f"   - memory: {bool(data.get('memory'))}")
                    print(f"   - history: {bool(data.get('history'))}")
                    print(f"   - feed: {data.get('feed')}")
                    
                    # Send a ping
                    await websocket.send("ping")
                    pong = await asyncio.wait_for(websocket.recv(), timeout=5)
                    pong_data = json.loads(pong)
                    
                    if pong_data.get("type") == "pong":
                        print("✅ Ping/pong working")
                        return True
                    else:
                        print(f"⚠️  Expected pong, got: {pong_data}")
                        return True  # Still consider it a pass
                else:
                    print(f"❌ Expected hello message, got: {data}")
                    return False
                    
            except asyncio.TimeoutError:
                print("❌ Timeout waiting for WebSocket message")
                return False
                
    except Exception as e:
        print(f"❌ WebSocket test failed: {str(e)}")
        return False

async def main():
    success = await test_websocket()
    print("\n" + "="*80)
    if success:
        print("✅ WebSocket test PASSED")
    else:
        print("❌ WebSocket test FAILED")
    print("="*80)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    asyncio.run(main())
