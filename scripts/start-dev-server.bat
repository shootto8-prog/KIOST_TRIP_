@echo off
cd /d "C:\Users\user\Desktop\vibe\trip"
echo ==== %date% %time% : dev server starting ==== >> "C:\Users\user\Desktop\vibe\trip\dev-server.log"
call npm run dev >> "C:\Users\user\Desktop\vibe\trip\dev-server.log" 2>&1
