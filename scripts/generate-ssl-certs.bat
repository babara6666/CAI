@echo off
REM Generate SSL certificates for development on Windows
REM Requires OpenSSL to be installed and in PATH

setlocal enabledelayedexpansion

set CERT_DIR=nginx\ssl
set DOMAIN=localhost

echo 🔐 Generating SSL certificates for development...

REM Create SSL directory if it doesn't exist
if not exist "%CERT_DIR%" mkdir "%CERT_DIR%"

REM Generate private key
openssl genrsa -out "%CERT_DIR%\key.pem" 2048

REM Create temporary config file for certificate
echo [req] > temp_cert.conf
echo distinguished_name = req_distinguished_name >> temp_cert.conf
echo req_extensions = v3_req >> temp_cert.conf
echo prompt = no >> temp_cert.conf
echo. >> temp_cert.conf
echo [req_distinguished_name] >> temp_cert.conf
echo C = US >> temp_cert.conf
echo ST = State >> temp_cert.conf
echo L = City >> temp_cert.conf
echo O = Organization >> temp_cert.conf
echo CN = %DOMAIN% >> temp_cert.conf
echo. >> temp_cert.conf
echo [v3_req] >> temp_cert.conf
echo keyUsage = keyEncipherment, dataEncipherment >> temp_cert.conf
echo extendedKeyUsage = serverAuth >> temp_cert.conf
echo subjectAltName = @alt_names >> temp_cert.conf
echo. >> temp_cert.conf
echo [alt_names] >> temp_cert.conf
echo DNS.1 = localhost >> temp_cert.conf
echo DNS.2 = *.localhost >> temp_cert.conf
echo IP.1 = 127.0.0.1 >> temp_cert.conf
echo IP.2 = ::1 >> temp_cert.conf

REM Generate certificate signing request
openssl req -new -key "%CERT_DIR%\key.pem" -out "%CERT_DIR%\csr.pem" -config temp_cert.conf

REM Generate self-signed certificate
openssl x509 -req -in "%CERT_DIR%\csr.pem" -signkey "%CERT_DIR%\key.pem" -out "%CERT_DIR%\cert.pem" -days 365 -extensions v3_req -extfile temp_cert.conf

REM Clean up temporary files
del "%CERT_DIR%\csr.pem"
del temp_cert.conf

echo ✅ SSL certificates generated successfully!
echo 📁 Certificates saved to: %CERT_DIR%\
echo 🔑 Private key: %CERT_DIR%\key.pem
echo 📜 Certificate: %CERT_DIR%\cert.pem
echo.
echo ⚠️  Note: These are self-signed certificates for development only.
echo    For production, use certificates from a trusted CA.
echo.
echo 🌐 You can now access the application at: https://localhost

pause