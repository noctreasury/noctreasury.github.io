@echo off
setlocal enabledelayedexpansion
title NOC Admin Installer

echo ========================================
echo    NOC ADMIN INSTALLATION
echo ========================================
echo.

:: Define paths
set "DEST_DIR=C:\noc\admin"
set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT_NAME=NOC ADMIN"
set "SHORTCUT_PATH=%DESKTOP%\%SHORTCUT_NAME%.url"
set "INDEX_PATH=%DEST_DIR%\index.html"

echo Step 1: Cleaning up previous installation...
if exist "%DEST_DIR%" (
    echo Removing old files from %DEST_DIR%
    rmdir /s /q "%DEST_DIR%" 2>nul
)
if exist "%SHORTCUT_PATH%" (
    echo Removing old shortcut from desktop
    del /f /q "%SHORTCUT_PATH%" 2>nul
)
echo Previous installation removed.
echo.

echo Step 2: Creating folder structure...
mkdir "%DEST_DIR%" 2>nul
if exist "%DEST_DIR%" (
    echo Folder created: %DEST_DIR%
) else (
    echo Failed to create folder. Make sure you have permissions.
    pause
    exit /b 1
)
echo.

echo Step 3: Copying files and folders...
echo Copying from: %CD%
echo Copying to: %DEST_DIR%
echo.

:: Copy all files and folders recursively
xcopy "%CD%\*" "%DEST_DIR%\" /E /I /Y /H
if %errorlevel% equ 0 (
    echo Files copied successfully.
) else (
    echo Warning: Some files may not have copied correctly.
)
echo.

echo Step 4: Creating desktop shortcut for index.html...
if exist "%INDEX_PATH%" (
    :: Create URL shortcut
    (
    echo [InternetShortcut]
    echo URL=file:///C:/noc/admin/index.html
    ) > "%SHORTCUT_PATH%"
    
    if exist "%SHORTCUT_PATH%" (
        echo Shortcut created successfully: %SHORTCUT_PATH%
    ) else (
        echo Error: Failed to create shortcut!
    )
) else (
    echo Error: index.html not found in the copied files!
    echo Available files in destination:
    dir "%DEST_DIR%" /b
)
echo.

echo ========================================
echo          INSTALLATION COMPLETE
echo ========================================
echo.
echo Files installed to: %DEST_DIR%
echo Shortcut location: %SHORTCUT_PATH%
echo.

:: Final verification
echo Final Check:
if exist "%DEST_DIR%" (echo [OK] Destination folder exists) else (echo [FAIL] Destination folder missing)
if exist "%INDEX_PATH%" (echo [OK] index.html exists) else (echo [FAIL] index.html missing)
if exist "%SHORTCUT_PATH%" (echo [OK] Desktop shortcut exists) else (echo [FAIL] Desktop shortcut missing)

echo.
echo The shortcut will open: file:///C:/Documents/noc/admin/index.html
echo.
pause