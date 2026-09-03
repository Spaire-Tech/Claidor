import sys, os, asyncio, pathlib
from playwright.async_api import async_playwright

OUT = pathlib.Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
WARM = sys.argv[2]
URLS = sys.argv[3:]
PROXY = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(
            headless=True,
            executable_path="/opt/pw-browsers/chromium",
            proxy={"server": PROXY} if PROXY else None,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--ignore-certificate-errors"],
        )
        ctx = await b.new_context(
            accept_downloads=True,
            ignore_https_errors=True,
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        )
        pg = await ctx.new_page()
        try:
            await pg.goto(WARM, wait_until="domcontentloaded", timeout=90000)
            await pg.wait_for_timeout(10000)
            print("warm title:", await pg.title())
        except Exception as e:
            print("warmup err", repr(e)[:200])
        for u in URLS:
            name = u.split("/")[-1].split("?")[0]
            try:
                r = await ctx.request.get(u, timeout=300000)
                body = await r.body()
                (OUT / name).write_bytes(body)
                print(f"{r.status} {len(body):>10} {name}")
            except Exception as e:
                print("ERR", u, repr(e)[:200])
        await b.close()


asyncio.run(main())
