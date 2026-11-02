#!/usr/bin/env python3
"""Make the Android project that `npx cap add android` generates into Immortal Blossoms' app:

- landscape only (sensorLandscape), and full screen: the status and navigation bars hide (immersive, a swipe
  brings them back for a moment);
- the app icon (adaptive, round and legacy) and the splash from android-res/ (tools/android_assets.py makes them);
- the version: versionName from package.json, versionCode from $VERSION_CODE (the CI run number) or 1.

    npx cap add android && python3 tools/android_setup.py && npx cap sync android

It edits the generated files in place and can run again on the same project.
"""
import glob
import json
import os
import re
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, 'android', 'app')
MAIN = os.path.join(APP, 'src', 'main')


def edit(path, fn):
    with open(path, encoding='utf8') as fh: s = fh.read()
    t = fn(s)
    if t != s:
        with open(path, 'w', encoding='utf8') as fh: fh.write(t)
    return t != s


def manifest():
    def f(s):
        if 'android:screenOrientation' in s: return s
        return s.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="sensorLandscape"', 1)
    print('manifest: landscape', edit(os.path.join(MAIN, 'AndroidManifest.xml'), f))


ACTIVITY = '''package {pkg};

import android.os.Bundle;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/** Immortal Blossoms: the game full screen, landscape, the system bars hidden until a swipe brings them back. */
public class MainActivity extends BridgeActivity {{
    @Override
    public void onCreate(Bundle savedInstanceState) {{
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        immersive();
    }}

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {{
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }}

    private void immersive() {{
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }}
}}
'''


def activity():
    path = glob.glob(os.path.join(MAIN, 'java', '**', 'MainActivity.java'), recursive=True)[0]
    pkg = re.search(r'^package\s+([\w.]+);', open(path, encoding='utf8').read(), re.M).group(1)
    with open(path, 'w', encoding='utf8') as fh: fh.write(ACTIVITY.format(pkg=pkg))
    print('MainActivity: immersive,', pkg)


def styles():
    """Draw under the display cutout in landscape, so the battle uses the whole screen."""
    def f(s):
        if 'windowLayoutInDisplayCutoutMode' in s: return s
        m = re.search(r'(<style name="AppTheme\.NoActionBar"[^>]*>)(.*?)(\s*</style>)', s, re.S)
        if not m: return s
        return s[:m.end(2)] + '\n        <item name="android:windowLayoutInDisplayCutoutMode" tools:targetApi="p">shortEdges</item>' + s[m.end(2):]
    path = os.path.join(MAIN, 'res', 'values', 'styles.xml')
    if os.path.exists(path):
        changed = edit(path, f)
        if changed and 'xmlns:tools' not in open(path, encoding='utf8').read():
            edit(path, lambda s: s.replace('<resources>', '<resources xmlns:tools="http://schemas.android.com/tools">', 1))
        print('styles: cutout', changed)


def resources():
    src = os.path.join(ROOT, 'android-res')
    n = 0
    for p in glob.glob(os.path.join(src, '**', '*.*'), recursive=True):
        rel = os.path.relpath(p, src); dst = os.path.join(MAIN, 'res', rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copyfile(p, dst); n += 1
    print('res: icon and splash,', n, 'files')


def version():
    name = json.load(open(os.path.join(ROOT, 'package.json')))['version'] + '-alpha'
    code = int(os.environ.get('VERSION_CODE') or 1)
    def f(s):
        s = re.sub(r'versionCode\s+\d+', f'versionCode {code}', s, count=1)
        return re.sub(r'versionName\s+"[^"]*"', f'versionName "{name}"', s, count=1)
    edit(os.path.join(APP, 'build.gradle'), f)
    print('version:', name, code)


if __name__ == '__main__':
    manifest(); activity(); styles(); resources(); version()
