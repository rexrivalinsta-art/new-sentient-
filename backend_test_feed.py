#!/usr/bin/env python3
"""
Test suite for AI thoughts feed feature
Tests: POST /api/tokens/import, GET /api/feed, GET /api/tokens/{key}/posts,
       POST /api/tokens/{key}/posts/{postId}/reply, POST /api/posts/{postId}/like
"""
import requests
import time
import json

# Backend URL from frontend/.env
BASE_URL = "https://aaac7669-3614-4784-a59c-29ba0117645f.preview.emergentagent.com/api"

# Test mint address (real existing pump.fun token - read-only)
TEST_MINT = "CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump"
TEST_WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"

def test_1_import_token():
    """Step 1: Import a live token to trigger launch post"""
    print("\n=== TEST 1: POST /api/tokens/import ===")
    
    response = requests.post(f"{BASE_URL}/tokens/import", json={"input": TEST_MINT})
    print(f"Status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
        return None
    
    data = response.json()
    print(f"✅ Token imported successfully")
    print(f"   Token ID: {data.get('token', {}).get('id')}")
    print(f"   Mint: {data.get('token', {}).get('mint')}")
    print(f"   Name: {data.get('token', {}).get('name')}")
    print(f"   Ticker: {data.get('token', {}).get('ticker')}")
    print(f"   Character: {data.get('profile', {}).get('characterName')}")
    
    return data

def test_2_get_feed():
    """Step 2: GET /api/feed - verify launch post exists"""
    print("\n=== TEST 2: GET /api/feed ===")
    
    response = requests.get(f"{BASE_URL}/feed")
    print(f"Status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
        return None
    
    data = response.json()
    items = data.get("items", [])
    print(f"✅ Feed retrieved: {len(items)} posts")
    
    # Find posts for our test mint
    test_posts = [p for p in items if p.get("mint") == TEST_MINT]
    print(f"   Posts for test token: {len(test_posts)}")
    
    if not test_posts:
        print(f"⚠️  WARNING: No posts found for test mint {TEST_MINT}")
        return None
    
    # Verify first post structure
    post = test_posts[0]
    required_fields = ["id", "mint", "ticker", "name", "characterName", "text", 
                      "authorType", "parentId", "timestamp", "context"]
    missing = [f for f in required_fields if f not in post]
    
    if missing:
        print(f"❌ FAILED: Missing fields: {missing}")
        return None
    
    print(f"✅ Post structure valid")
    print(f"   Post ID: {post['id']}")
    print(f"   Author Type: {post['authorType']}")
    print(f"   Text: {post['text'][:100]}...")
    print(f"   Source: {post.get('source', 'N/A')}")
    print(f"   Context marketCap: {post.get('context', {}).get('marketCap')}")
    
    # Verify authorType is "ai"
    if post["authorType"] != "ai":
        print(f"❌ FAILED: Expected authorType='ai', got '{post['authorType']}'")
        return None
    
    # Verify parentId is None (top-level post)
    if post["parentId"] is not None:
        print(f"❌ FAILED: Expected parentId=None, got '{post['parentId']}'")
        return None
    
    # Verify text is non-empty
    if not post["text"] or not post["text"].strip():
        print(f"❌ FAILED: Post text is empty")
        return None
    
    # Verify context has marketCap field (may be null)
    if "marketCap" not in post.get("context", {}):
        print(f"❌ FAILED: Context missing marketCap field")
        return None
    
    print(f"✅ All validations passed")
    return test_posts[0]

def test_3_get_token_posts():
    """Step 3: GET /api/tokens/{mint}/posts - verify nested replies structure"""
    print("\n=== TEST 3: GET /api/tokens/{mint}/posts ===")
    
    response = requests.get(f"{BASE_URL}/tokens/{TEST_MINT}/posts")
    print(f"Status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
        return None
    
    data = response.json()
    items = data.get("items", [])
    token = data.get("token", {})
    
    print(f"✅ Token posts retrieved")
    print(f"   Token: {token.get('name')} ({token.get('ticker')})")
    print(f"   Mint: {token.get('mint')}")
    print(f"   Top-level posts: {len(items)}")
    
    if not items:
        print(f"⚠️  WARNING: No posts found")
        return None
    
    # Verify each post has replies array
    for i, post in enumerate(items):
        if "replies" not in post:
            print(f"❌ FAILED: Post {i} missing 'replies' array")
            return None
        print(f"   Post {i+1}: {len(post['replies'])} replies")
    
    print(f"✅ All posts have replies array")
    return items[0] if items else None

def test_4_reply_to_post(post_id):
    """Step 4: POST /api/tokens/{mint}/posts/{postId}/reply"""
    print("\n=== TEST 4: POST /api/tokens/{mint}/posts/{postId}/reply ===")
    
    reply_text = "Are you going to make it, little guy?"
    
    response = requests.post(
        f"{BASE_URL}/tokens/{TEST_MINT}/posts/{post_id}/reply",
        json={"text": reply_text, "wallet": TEST_WALLET}
    )
    print(f"Status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
        return None
    
    data = response.json()
    user_post = data.get("userPost")
    ai_post = data.get("aiPost")
    
    if not user_post or not ai_post:
        print(f"❌ FAILED: Missing userPost or aiPost in response")
        return None
    
    print(f"✅ Reply created successfully")
    print(f"   User post ID: {user_post.get('id')}")
    print(f"   User text: {user_post.get('text')}")
    print(f"   AI post ID: {ai_post.get('id')}")
    print(f"   AI text: {ai_post.get('text')}")
    print(f"   AI source: {ai_post.get('source')}")
    
    # Verify AI post structure
    if ai_post.get("authorType") != "ai":
        print(f"❌ FAILED: AI post authorType should be 'ai', got '{ai_post.get('authorType')}'")
        return None
    
    if ai_post.get("parentId") != post_id:
        print(f"❌ FAILED: AI post parentId should be '{post_id}', got '{ai_post.get('parentId')}'")
        return None
    
    if not ai_post.get("text") or not ai_post.get("text").strip():
        print(f"❌ FAILED: AI post text is empty")
        return None
    
    print(f"✅ AI reply validation passed")
    
    # Verify reply count incremented
    print("\n   Verifying reply count...")
    response = requests.get(f"{BASE_URL}/tokens/{TEST_MINT}/posts")
    if response.status_code == 200:
        data = response.json()
        parent = next((p for p in data.get("items", []) if p["id"] == post_id), None)
        if parent:
            reply_count = len(parent.get("replies", []))
            print(f"   Parent post now has {reply_count} replies")
            if reply_count >= 2:
                print(f"✅ Reply count incremented correctly")
            else:
                print(f"⚠️  WARNING: Expected at least 2 replies, got {reply_count}")
    
    return ai_post

def test_5_like_post(post_id):
    """Step 5: POST /api/posts/{postId}/like"""
    print("\n=== TEST 5: POST /api/posts/{postId}/like ===")
    
    # First like
    response = requests.post(f"{BASE_URL}/posts/{post_id}/like")
    print(f"Status (first like): {response.status_code}")
    
    if response.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
        return False
    
    data = response.json()
    likes_1 = data.get("likes")
    print(f"✅ First like successful: {likes_1} likes")
    
    # Second like
    response = requests.post(f"{BASE_URL}/posts/{post_id}/like")
    print(f"Status (second like): {response.status_code}")
    
    if response.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {response.status_code}")
        return False
    
    data = response.json()
    likes_2 = data.get("likes")
    print(f"✅ Second like successful: {likes_2} likes")
    
    if likes_2 > likes_1:
        print(f"✅ Like count incremented correctly ({likes_1} -> {likes_2})")
        return True
    else:
        print(f"⚠️  WARNING: Like count did not increment ({likes_1} -> {likes_2})")
        return False

def test_6_edge_cases(post_id):
    """Step 6: Test edge cases"""
    print("\n=== TEST 6: Edge Cases ===")
    
    # Test 6a: Empty text reply
    print("\n6a. Reply with empty text -> expect 400")
    response = requests.post(
        f"{BASE_URL}/tokens/{TEST_MINT}/posts/{post_id}/reply",
        json={"text": "", "wallet": TEST_WALLET}
    )
    if response.status_code == 400:
        print(f"✅ Correctly rejected empty text (400)")
    else:
        print(f"❌ FAILED: Expected 400, got {response.status_code}")
    
    # Test 6b: Reply to non-existent post
    print("\n6b. Reply to non-existent post -> expect 404")
    response = requests.post(
        f"{BASE_URL}/tokens/{TEST_MINT}/posts/nonexistent123/reply",
        json={"text": "test", "wallet": TEST_WALLET}
    )
    if response.status_code == 404:
        print(f"✅ Correctly returned 404 for non-existent post")
    else:
        print(f"❌ FAILED: Expected 404, got {response.status_code}")
    
    # Test 6c: Like non-existent post
    print("\n6c. Like non-existent post -> expect 404")
    response = requests.post(f"{BASE_URL}/posts/nonexistent123/like")
    if response.status_code == 404:
        print(f"✅ Correctly returned 404 for non-existent post")
    else:
        print(f"❌ FAILED: Expected 404, got {response.status_code}")

def test_7_autonomous_generation():
    """Step 7: Wait and check for autonomous posts"""
    print("\n=== TEST 7: Autonomous Post Generation ===")
    print("Waiting 70 seconds to check for idle/event loop posts...")
    print("(Idle loop posts if no activity for ~240s, checking if any new posts appear)")
    
    # Get current post count
    response = requests.get(f"{BASE_URL}/feed")
    if response.status_code != 200:
        print(f"⚠️  Could not get initial feed")
        return
    
    initial_posts = [p for p in response.json().get("items", []) if p.get("mint") == TEST_MINT]
    initial_count = len(initial_posts)
    print(f"Initial post count for test token: {initial_count}")
    
    # Wait 70 seconds
    for i in range(7):
        time.sleep(10)
        print(f"   {(i+1)*10}s elapsed...")
    
    # Check again
    response = requests.get(f"{BASE_URL}/feed")
    if response.status_code != 200:
        print(f"⚠️  Could not get final feed")
        return
    
    final_posts = [p for p in response.json().get("items", []) if p.get("mint") == TEST_MINT]
    final_count = len(final_posts)
    print(f"Final post count for test token: {final_count}")
    
    if final_count > initial_count:
        new_posts = final_count - initial_count
        print(f"✅ Autonomous generation detected: {new_posts} new post(s)")
        # Show the new posts
        for post in final_posts[:new_posts]:
            print(f"   New post: {post.get('kind')} - {post.get('text', '')[:80]}...")
    else:
        print(f"ℹ️  No new autonomous posts within 70s window")
        print(f"   (This is expected - idle loop posts after ~240s of inactivity)")

def main():
    print("=" * 80)
    print("AI THOUGHTS FEED TEST SUITE")
    print("=" * 80)
    print(f"Backend URL: {BASE_URL}")
    print(f"Test Mint: {TEST_MINT}")
    print("=" * 80)
    
    # Test 1: Import token
    token_data = test_1_import_token()
    if not token_data:
        print("\n❌ TEST SUITE FAILED: Could not import token")
        return
    
    # Small delay to let launch post be created
    print("\nWaiting 3 seconds for launch post to be created...")
    time.sleep(3)
    
    # Test 2: Get feed
    launch_post = test_2_get_feed()
    if not launch_post:
        print("\n⚠️  WARNING: Could not verify feed, continuing with other tests...")
        # Try to get a post from token posts endpoint
        response = requests.get(f"{BASE_URL}/tokens/{TEST_MINT}/posts")
        if response.status_code == 200:
            items = response.json().get("items", [])
            if items:
                launch_post = items[0]
    
    # Test 3: Get token posts
    first_post = test_3_get_token_posts()
    if not first_post:
        print("\n❌ TEST SUITE FAILED: Could not get token posts")
        return
    
    post_id = first_post["id"]
    
    # Test 4: Reply to post
    ai_reply = test_4_reply_to_post(post_id)
    if not ai_reply:
        print("\n⚠️  WARNING: Reply test failed, continuing...")
    
    # Test 5: Like post
    test_5_like_post(post_id)
    
    # Test 6: Edge cases
    test_6_edge_cases(post_id)
    
    # Test 7: Autonomous generation
    test_7_autonomous_generation()
    
    print("\n" + "=" * 80)
    print("TEST SUITE COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    main()
