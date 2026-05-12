"""
Hotel Fountain BD — Facebook Graph API Publisher
Automated Marketer agent calls this script to post room content to the Facebook Page.

Usage:
    python scripts/facebook_post.py --message "Room of the Day..." [--image-url URL]

Env vars required:
    FACEBOOK_PAGE_TOKEN   — Long-lived Page Access Token from developers.facebook.com
    FACEBOOK_PAGE_ID      — Numeric Page ID (visible in Page → About → Page transparency)
"""

import os
import sys
import json
import argparse
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime


GRAPH_API_VERSION = "v19.0"
GRAPH_API_BASE    = f"https://graph.facebook.com/{GRAPH_API_VERSION}"
MAX_RETRIES       = 2


def _get_env(key: str) -> str:
    val = os.environ.get(key, "").strip()
    if not val:
        raise EnvironmentError(
            f"Missing required env var: {key}\n"
            f"Set it in Vercel Dashboard → Project → Settings → Environment Variables\n"
            f"Or locally in .env.local"
        )
    return val


def _api_post(endpoint: str, payload: dict, token: str) -> dict:
    """POST to Graph API with retry on transient errors. Returns parsed JSON."""
    url = f"{GRAPH_API_BASE}/{endpoint}"
    payload["access_token"] = token
    data = urllib.parse.urlencode(payload).encode("utf-8")

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(url, data=data, method="POST")
            req.add_header("Content-Type", "application/x-www-form-urlencoded")
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8")
            err  = json.loads(body) if body else {}
            code = err.get("error", {}).get("code", 0)
            # Retry on 500-level only
            if e.code >= 500 and attempt < MAX_RETRIES:
                print(f"[attempt {attempt}] Graph API {e.code} — retrying...", file=sys.stderr)
                continue
            raise RuntimeError(
                f"Graph API error {e.code}: {err.get('error', {}).get('message', body)}\n"
                f"Error code: {code}"
            )
    raise RuntimeError("Max retries exceeded")


def post_text(page_id: str, token: str, message: str) -> dict:
    """Post a text-only update to the Facebook Page feed."""
    return _api_post(f"{page_id}/feed", {"message": message}, token)


def post_photo(page_id: str, token: str, message: str, image_url: str) -> dict:
    """Post a photo with caption to the Facebook Page."""
    return _api_post(
        f"{page_id}/photos",
        {"message": message, "url": image_url},
        token,
    )


def validate_token(token: str, page_id: str) -> bool:
    """Quick sanity check: verify token can read the page."""
    url = f"{GRAPH_API_BASE}/{page_id}?fields=name,fan_count&access_token={token}"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"✅ Token valid — Page: {data.get('name')} ({data.get('fan_count', 0):,} followers)")
            return True
    except Exception as e:
        print(f"❌ Token validation failed: {e}", file=sys.stderr)
        return False


def build_room_of_day_message(room_name: str, rate_bdt: int, features: list[str], whatsapp: str) -> str:
    """Format a standard 'Room of the Day' post. Called by automated-marketer agent."""
    feature_line = " · ".join(features) if features else ""
    return (
        f"🏨 Room of the Day — Hotel Fountain\n\n"
        f"📍 {room_name}\n"
        f"💰 ৳{rate_bdt:,} / night\n"
        f"{f'✨ {feature_line}' if feature_line else ''}\n\n"
        f"📍 Nikunja 2, Khilkhet, Dhaka — 3 km from Airport\n"
        f"📲 Book via WhatsApp: {whatsapp}\n\n"
        f"#HotelFountain #DhakaHotel #Nikunja2 #AirportHotel #Bangladesh"
    ).strip()


def build_testimonial_message(guest_initial: str, room_name: str, rating: int, review: str) -> str:
    """Format a guest testimonial post. Caller must ensure guest has consented (marketing_opt_out=false)."""
    stars = "⭐" * min(rating, 5)
    return (
        f"{stars} Guest Review — Hotel Fountain\n\n"
        f"\"{review}\"\n"
        f"— Guest {guest_initial}, {room_name}\n\n"
        f"Experience Hotel Fountain for yourself.\n"
        f"📍 Nikunja 2, Khilkhet, Dhaka | 3 km from Airport\n\n"
        f"#HotelFountain #GuestReview #DhakaHotel"
    )


def main():
    parser = argparse.ArgumentParser(description="Hotel Fountain Facebook Publisher")
    parser.add_argument("--message",   required=True,  help="Post text content")
    parser.add_argument("--image-url", required=False, help="Public image URL for photo post")
    parser.add_argument("--validate",  action="store_true", help="Validate token only, do not post")
    parser.add_argument("--dry-run",   action="store_true", help="Print payload without posting")
    args = parser.parse_args()

    try:
        token   = _get_env("FACEBOOK_PAGE_TOKEN")
        page_id = _get_env("FACEBOOK_PAGE_ID")
    except EnvironmentError as e:
        print(f"❌ {e}", file=sys.stderr)
        sys.exit(1)

    if args.validate:
        sys.exit(0 if validate_token(token, page_id) else 1)

    if args.dry_run:
        print("=== DRY RUN — no post will be published ===")
        print(f"Page ID : {page_id}")
        print(f"Image   : {args.image_url or '(none)'}")
        print(f"Message :\n{args.message}")
        sys.exit(0)

    try:
        if args.image_url:
            result = post_photo(page_id, token, args.message, args.image_url)
        else:
            result = post_text(page_id, token, args.message)

        post_id = result.get("post_id") or result.get("id", "unknown")
        print(f"✅ Published — Post ID: {post_id}")
        print(f"   URL: https://www.facebook.com/{post_id.replace('_', '/posts/')}")
        print(json.dumps({"status": "published", "post_id": post_id, "ts": datetime.utcnow().isoformat()}))

    except RuntimeError as e:
        print(f"❌ Publish failed: {e}", file=sys.stderr)
        # Log to stdout as JSON so automated-marketer agent can parse the error
        print(json.dumps({"status": "error", "message": str(e), "ts": datetime.utcnow().isoformat()}))
        sys.exit(1)


if __name__ == "__main__":
    main()
