"""
How long a change on the computer's screen takes to reach a VNC viewer
(15 October 2026; the numbers are in box/bin/simeon-desktop and
docs/services-agents.md §15).

Starts Xvfb (1280x800, as the box), optionally picom (as the box), and
x11vnc with the flags given, then a minimal RFB viewer that asks for
updates the way noVNC does (a new incremental request as soon as an update
is read). A drawing window paints a small rectangle (a typed letter, or a
2-pixel caret) after a pause, and the time until an update covering it
arrives is recorded.

    python3 -I box/test/screen-latency.py <label> <display> <port> [--picom] -- <x11vnc flags...>

Run where Xvfb, x11vnc and picom are installed (not inside a running box:
it starts its own display). PICOM_DAMAGE=1 runs picom repainting only what
changed (box/bin/simeon-desktop now); without it, picom --no-use-damage (as it was
before). REMOTE="cmd;cmd" sends x11vnc remote-control commands after it
starts. INPUT=1 sends the viewer's pointer first, as when the person types.

    python3 -I box/test/screen-latency.py before :71 5971 --picom -- -localhost -nopw -shared -forever -noxdamage -quiet
    PICOM_DAMAGE=1 python3 -I box/test/screen-latency.py now :72 5972 --picom -- -localhost -nopw -shared -forever -quiet
"""
import ctypes
import ctypes.util
import os
import random
import socket
import statistics
import struct
import subprocess
import sys
import threading
import time

label, display, port = sys.argv[1], sys.argv[2], int(sys.argv[3])
rest = sys.argv[4:]
use_picom = "--picom" in rest
flags = rest[rest.index("--") + 1 :]
W, H = 1280, 800

procs = []


def start(argv, log):
    p = subprocess.Popen(argv, stdout=open(log, "w"), stderr=subprocess.STDOUT)
    procs.append(p)
    return p


start(["Xvfb", display, "-screen", "0", f"{W}x{H}x24", "-ac", "+extension", "GLX", "+render", "-noreset"], f"/tmp/vnclag-xvfb{display}.log")
env = dict(os.environ, DISPLAY=display)
for _ in range(100):
    if subprocess.run(["xdpyinfo", "-display", display], capture_output=True).returncode == 0:
        break
    time.sleep(0.1)
if use_picom:
    procs.append(subprocess.Popen(["picom", "--backend", "xrender", "--no-vsync"] + ([] if os.environ.get("PICOM_DAMAGE") else ["--no-use-damage"]), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
start(["x11vnc", "-display", display, "-rfbport", str(port), *flags], f"/tmp/vnclag-x11vnc{display}.log")
time.sleep(1.5)
remote_answers = []
for command in [c for c in os.environ.get("REMOTE", "").split(";") if c]:
    out = subprocess.run(["x11vnc", "-display", display, "-R", command], capture_output=True, text=True, timeout=20)
    remote_answers.append(f"{command} -> {(out.stdout or out.stderr).strip().splitlines()[-1] if (out.stdout or out.stderr).strip() else out.returncode}")
time.sleep(0.5)

# --- drawing -------------------------------------------------------------
X = ctypes.cdll.LoadLibrary(ctypes.util.find_library("X11"))
X.XOpenDisplay.restype = ctypes.c_void_p
X.XOpenDisplay.argtypes = [ctypes.c_char_p]
X.XDefaultScreen.argtypes = [ctypes.c_void_p]
X.XRootWindow.restype = ctypes.c_ulong
X.XRootWindow.argtypes = [ctypes.c_void_p, ctypes.c_int]
X.XCreateSimpleWindow.restype = ctypes.c_ulong
X.XCreateSimpleWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint, ctypes.c_ulong, ctypes.c_ulong]
X.XMapWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
X.XCreateGC.restype = ctypes.c_void_p
X.XCreateGC.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_void_p]
X.XSetForeground.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong]
X.XFillRectangle.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint]
X.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]

dpy = X.XOpenDisplay(display.encode())
root = X.XRootWindow(dpy, X.XDefaultScreen(dpy))
win = X.XCreateSimpleWindow(dpy, root, 0, 0, W, H, 0, 0, 0xFFFFFF)
X.XMapWindow(dpy, win)
gc = X.XCreateGC(dpy, win, 0, None)
X.XSync(dpy, 0)
time.sleep(1.0)

# --- a viewer ------------------------------------------------------------
s = socket.create_connection(("127.0.0.1", port))
s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)


def read(n):
    buf = b""
    while len(buf) < n:
        chunk = s.recv(n - len(buf))
        if not chunk:
            raise EOFError
        buf += chunk
    return buf


read(12)
s.sendall(b"RFB 003.008\n")
n = read(1)[0]
read(n)
s.sendall(b"\x01")
read(4)
s.sendall(b"\x01")
fw, fh = struct.unpack(">HH", read(4))
read(16)
read(struct.unpack(">I", read(4))[0])
s.sendall(struct.pack(">B3xBBBBHHHBBB3x", 0, 32, 24, 0, 1, 255, 255, 255, 16, 8, 0))
s.sendall(struct.pack(">BxHi", 2, 1, 0))  # Raw only

updates = []  # (time, [(x, y, w, h)])
lock = threading.Lock()
stop = False


def request(incremental):
    s.sendall(struct.pack(">BBHHHH", 3, incremental, 0, 0, fw, fh))


def viewer():
    request(0)
    while not stop:
        try:
            kind = read(1)[0]
        except (EOFError, OSError):
            return
        if kind == 0:
            read(1)
            count = struct.unpack(">H", read(2))[0]
            rects = []
            for _ in range(count):
                x, y, w, h, enc = struct.unpack(">HHHHi", read(12))
                if enc == 0:
                    read(w * h * 4)
                rects.append((x, y, w, h))
            with lock:
                updates.append((time.monotonic(), rects))
            request(1)
        elif kind == 2:
            pass
        elif kind == 3:
            read(3)
            read(struct.unpack(">I", read(4))[0])
        elif kind == 1:
            read(3)
            read(struct.unpack(">H", read(2))[0] * 6)


t = threading.Thread(target=viewer, daemon=True)
t.start()
time.sleep(2.0)


def covers(rects, x, y, w, h):
    return any(rx <= x and ry <= y and rx + rw >= x + w and ry + rh >= y + h for rx, ry, rw, rh in rects)


def sample(pause, w, h):
    time.sleep(pause)
    x, y = random.randrange(40, W - 60), random.randrange(40, H - 60)
    X.XSetForeground(dpy, gc, random.randrange(0x000000, 0xFFFFFF))
    with lock:
        seen = len(updates)
    if os.environ.get("INPUT"):
        # The person's own key or click reaches x11vnc first, as when typing through the viewer.
        s.sendall(struct.pack(">BBHH", 5, 0, x, y))
        time.sleep(0.005)
    t0 = time.monotonic()
    X.XFillRectangle(dpy, win, gc, x, y, w, h)
    X.XSync(dpy, 0)
    deadline = t0 + 5.0
    while time.monotonic() < deadline:
        with lock:
            for at, rects in updates[seen:]:
                if covers(rects, x, y, w, h):
                    return (at - t0) * 1000
        time.sleep(0.002)
    return 5000.0


random.seed(7)
results = {}
for name, pause, w, h in [
    ("letter while typing (0.25 s apart)", 0.25, 9, 14),
    ("letter after 3 s idle", 3.0, 9, 14),
    ("caret (2 px) while typing", 0.25, 2, 2),
]:
    times = [sample(pause, w, h) for _ in range(12)]
    results[name] = times

stop = True
print("   remote:", remote_answers) if remote_answers else None
print(f"== {label}: x11vnc {' '.join(flags)}{(' + picom' + ('' if os.environ.get('PICOM_DAMAGE') else ' --no-use-damage')) if use_picom else ''}")
for name, times in results.items():
    times.sort()
    print(f"   {name:38s} median {statistics.median(times):6.0f} ms   worst {times[-1]:6.0f} ms   best {times[0]:5.0f} ms")
for p in reversed(procs):
    p.terminate()
for p in procs:
    try:
        p.wait(timeout=3)
    except subprocess.TimeoutExpired:
        p.kill()
