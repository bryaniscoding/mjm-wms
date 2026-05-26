@echo off
title MJM Groups — Deploy to Vercel
color 0A
echo.
echo  Deploying MJM Groups WMS...
echo.
cd /d "C:\Users\User\Desktop\TKI Management Portal"
git add .
set /p msg="What did you change? "
git commit -m "%msg%"
git push
echo.
echo  Done! Site updates in ~30 seconds.
echo  https://mjm-wms.vercel.app
echo.
pause