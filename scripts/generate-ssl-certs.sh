#!/bin/bash

# Generate SSL certificates for development
# For production, use proper certificates from a CA like Let's Encrypt

set -e

CERT_DIR="nginx/ssl"
DOMAIN="localhost"

echo "🔐 Generating SSL certificates for development..."

# Create SSL directory if it doesn't exist
mkdir -p "$CERT_DIR"

# Generate private key
openssl genrsa -out "$CERT_DIR/key.pem" 2048

# Generate certificate signing request
openssl req -new -key "$CERT_DIR/key.pem" -out "$CERT_DIR/csr.pem" -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN"

# Generate self-signed certificate
openssl x509 -req -in "$CERT_DIR/csr.pem" -signkey "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" -days 365 -extensions v3_req -extfile <(
cat <<EOF
[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
EOF
)

# Clean up CSR
rm "$CERT_DIR/csr.pem"

# Set proper permissions
chmod 600 "$CERT_DIR/key.pem"
chmod 644 "$CERT_DIR/cert.pem"

echo "✅ SSL certificates generated successfully!"
echo "📁 Certificates saved to: $CERT_DIR/"
echo "🔑 Private key: $CERT_DIR/key.pem"
echo "📜 Certificate: $CERT_DIR/cert.pem"
echo ""
echo "⚠️  Note: These are self-signed certificates for development only."
echo "   For production, use certificates from a trusted CA."
echo ""
echo "🌐 You can now access the application at: https://localhost"