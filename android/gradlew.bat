@echo off
setlocal
set DIRNAME=%~dp0
if "%JAVA_HOME%"=="" (
  set JAVA_EXE=java.exe
) else (
  set JAVA_EXE=%JAVA_HOME%\bin\java.exe
)
if not exist "%DIRNAME%gradle\wrapper\gradle-wrapper.jar" (
  echo Gradle wrapper jar is not present. Run `pnpm cap sync android` after installing dependencies or open android in Android Studio.
  exit /b 1
)
"%JAVA_EXE%" -Xmx64m -Xms64m -Dorg.gradle.appname=gradlew -classpath "%DIRNAME%gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*
endlocal
