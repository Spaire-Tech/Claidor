#!/usr/bin/env python3
"""Phase 0 bake-off — step 1: pull a channel's PUBLIC data from YouTube.

Public API key only. No OAuth, no scraping, no transcripts. Everything this
script reads is visible to anyone: video titles/descriptions/stats, comment
threads, and the creator's own public replies.

Usage:
    YOUTUBE_API_KEY=... python fetch_channel.py @somehandle
    YOUTUBE_API_KEY=... python fetch_channel.py https://www.youtube.com/@somehandle
    YOUTUBE_API_KEY=... python fetch_channel.py UCxxxxxxxxxxxxxxxxxxxxxx

Writes data/<slug>/channel.json — the raw snapshot every later step reads.
Quota cost: ~1 unit per 50 videos + ~1-2 units per candidate video's comments.
A 300-video channel is well under 100 units of the 10,000/day default quota.
"""

from __future__ import annotations

import json
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API_BASE = "https://www.googleapis.com/youtube/v3"

# How many videos get their comment threads pulled. Chosen by outlier ratio
# (the fast-pass candidates) plus the most-commented videos.
COMMENT_CANDIDATES = 25
COMMENT_PAGES_PER_VIDEO = 2  # x100 comments/page, order=relevance

# A video younger than this hasn't matured; its view count would poison the
# outlier baseline, so it's flagged and excluded from ratio math.
MIN_AGE_DAYS = 45

# Under 62s duration ≈ a Short. Shorts live in a different attention economy
# and would wreck the long-form baseline, so they're flagged out of it.
SHORT_MAX_SECONDS = 62


def api_key() -> str:
    import os

    key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if not key:
        sys.exit("Set YOUTUBE_API_KEY (a plain Data API v3 key, no OAuth needed).")
    return key


def get(endpoint: str, **params: str) -> dict:
    params["key"] = api_key()
    url = f"{API_BASE}/{endpoint}?{urllib.parse.urlencode(params)}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            # 403 with commentsDisabled is a per-video condition, not an error.
            if e.code == 403 and "commentsDisabled" in body:
                return {"items": [], "_comments_disabled": True}
            if e.code in (500, 503) and attempt < 3:
                time.sleep(2**attempt)
                continue
            sys.exit(f"YouTube API error {e.code} on {endpoint}: {body[:400]}")
    raise RuntimeError("unreachable")


def resolve_channel(ref: str) -> dict:
    """Accept @handle, channel URL, or raw UC… id; return the channel item."""
    ref = ref.strip()
    if ref.startswith("http"):
        path = urllib.parse.urlparse(ref).path.strip("/")
        if path.startswith("channel/"):
            ref = path.split("/")[1]
        elif path.startswith("@"):
            ref = path.split("/")[0]
        elif path.startswith("user/"):
            data = get(
                "channels",
                part="snippet,statistics,contentDetails",
                forUsername=path.split("/")[1],
            )
            if data.get("items"):
                return data["items"][0]
            sys.exit(f"Could not resolve legacy /user/ URL: {ref}")
        else:
            sys.exit(
                f"Can't parse '{ref}'. Use an @handle, a /channel/UC… URL, or a raw UC… id."
            )
    if re.fullmatch(r"UC[\w-]{22}", ref):
        data = get("channels", part="snippet,statistics,contentDetails", id=ref)
    else:
        handle = ref if ref.startswith("@") else f"@{ref}"
        data = get(
            "channels", part="snippet,statistics,contentDetails", forHandle=handle
        )
    if not data.get("items"):
        sys.exit(f"No channel found for '{ref}'.")
    return data["items"][0]


def iso_duration_seconds(d: str) -> int:
    m = re.fullmatch(
        r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", d or ""
    )
    if not m:
        return 0
    days, h, mi, s = (int(g or 0) for g in m.groups())
    return days * 86400 + h * 3600 + mi * 60 + s


def walk_uploads(uploads_playlist: str) -> list[str]:
    ids: list[str] = []
    token = ""
    while True:
        params = dict(
            part="contentDetails", playlistId=uploads_playlist, maxResults="50"
        )
        if token:
            params["pageToken"] = token
        page = get("playlistItems", **params)
        ids += [it["contentDetails"]["videoId"] for it in page.get("items", [])]
        token = page.get("nextPageToken", "")
        if not token:
            break
    return ids


def fetch_videos(video_ids: list[str]) -> list[dict]:
    out: list[dict] = []
    now = datetime.now(timezone.utc)
    for i in range(0, len(video_ids), 50):
        batch = get(
            "videos",
            part="snippet,statistics,contentDetails",
            id=",".join(video_ids[i : i + 50]),
        )
        for v in batch.get("items", []):
            sn, st = v["snippet"], v.get("statistics", {})
            published = datetime.fromisoformat(sn["publishedAt"].replace("Z", "+00:00"))
            secs = iso_duration_seconds(v.get("contentDetails", {}).get("duration", ""))
            out.append(
                {
                    "id": v["id"],
                    "title": sn["title"],
                    "description": sn.get("description", "")[:2000],
                    "published_at": sn["publishedAt"],
                    "age_days": (now - published).days,
                    "duration_seconds": secs,
                    "is_short": secs <= SHORT_MAX_SECONDS,
                    "definition": v.get("contentDetails", {}).get("definition", ""),
                    "views": int(st.get("viewCount", 0)),
                    "likes": int(st.get("likeCount", 0)),
                    "comment_count": int(st.get("commentCount", 0)),
                    "thumbnail": (sn.get("thumbnails", {}).get("high") or {}).get(
                        "url", ""
                    ),
                }
            )
    return out


def outlier_ratios(videos: list[dict]) -> None:
    """Score each mature long-form video against the median of its ~10
    nearest-by-date long-form neighbors. Growth-proof: a 2019 video is judged
    by 2019's baseline, never by today's."""
    eligible = [
        v for v in videos if not v["is_short"] and v["age_days"] >= MIN_AGE_DAYS
    ]
    eligible.sort(key=lambda v: v["published_at"])
    for idx, v in enumerate(eligible):
        neighbors = [
            n["views"]
            for n in eligible[max(0, idx - 5) : idx + 6]
            if n["id"] != v["id"]
        ]
        baseline = statistics.median(neighbors) if neighbors else 0
        v["baseline_views"] = int(baseline)
        v["outlier_ratio"] = round(v["views"] / baseline, 2) if baseline else None


def fetch_comments(video_id: str, channel_id: str) -> dict:
    comments: list[dict] = []
    owner_replies: list[dict] = []
    token = ""
    disabled = False
    for _ in range(COMMENT_PAGES_PER_VIDEO):
        params = dict(
            part="snippet,replies",
            videoId=video_id,
            order="relevance",
            maxResults="100",
            textFormat="plainText",
        )
        if token:
            params["pageToken"] = token
        page = get("commentThreads", **params)
        if page.get("_comments_disabled"):
            disabled = True
            break
        for th in page.get("items", []):
            top = th["snippet"]["topLevelComment"]["snippet"]
            comments.append(
                {
                    "text": top.get("textDisplay", "")[:600],
                    "likes": int(top.get("likeCount", 0)),
                    "author": top.get("authorDisplayName", ""),
                }
            )
            for rep in (th.get("replies", {}) or {}).get("comments", []):
                rs = rep["snippet"]
                if (rs.get("authorChannelId") or {}).get("value") == channel_id:
                    owner_replies.append({"text": rs.get("textDisplay", "")[:600]})
        token = page.get("nextPageToken", "")
        if not token:
            break
    return {
        "video_id": video_id,
        "comments_disabled": disabled,
        "comments": comments,
        "owner_replies": owner_replies,
    }


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    channel = resolve_channel(sys.argv[1])
    ch_id = channel["id"]
    sn, st = channel["snippet"], channel.get("statistics", {})
    slug = re.sub(r"[^a-z0-9]+", "-", sn["title"].lower()).strip("-") or ch_id

    print(f"Resolved: {sn['title']} ({st.get('videoCount', '?')} videos)")
    uploads = channel["contentDetails"]["relatedPlaylists"]["uploads"]
    video_ids = walk_uploads(uploads)
    print(f"Uploads playlist: {len(video_ids)} videos")
    videos = fetch_videos(video_ids)
    outlier_ratios(videos)

    ranked = [v for v in videos if v.get("outlier_ratio")]
    ranked.sort(key=lambda v: v["outlier_ratio"], reverse=True)
    by_comments = sorted(
        (v for v in videos if not v["is_short"]),
        key=lambda v: v["comment_count"],
        reverse=True,
    )
    candidate_ids: list[str] = []
    for v in ranked[:COMMENT_CANDIDATES] + by_comments[:5]:
        if v["id"] not in candidate_ids:
            candidate_ids.append(v["id"])
    candidate_ids = candidate_ids[:COMMENT_CANDIDATES + 5]

    print(f"Pulling comments for {len(candidate_ids)} candidate videos…")
    comment_data = [fetch_comments(vid, ch_id) for vid in candidate_ids]

    out_dir = Path(__file__).parent / "data" / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    snapshot = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "channel": {
            "id": ch_id,
            "title": sn["title"],
            "handle": sn.get("customUrl", ""),
            "about": sn.get("description", ""),
            "created_at": sn.get("publishedAt", ""),
            "avatar": (sn.get("thumbnails", {}).get("high") or {}).get("url", ""),
            "subscribers": int(st.get("subscriberCount", 0)),
            "video_count": int(st.get("videoCount", 0)),
        },
        "videos": videos,
        "comment_threads": comment_data,
    }
    path = out_dir / "channel.json"
    path.write_text(json.dumps(snapshot, indent=1, ensure_ascii=False))
    n_comments = sum(len(c["comments"]) for c in comment_data)
    print(f"Wrote {path} ({len(videos)} videos, {n_comments} comments)")


if __name__ == "__main__":
    main()
