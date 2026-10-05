import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

export const config = {
  port: parseInt(process.env['PORT'] ?? '4001', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  db: {
    host: "192.168.1.7",
    port: 5433,
    name: "GeekeyyUAT",
    user: "postgres",
    password: "Signa@123",
  },
  frontendUrls: process.env['FRONTEND_URL']?.split(',')?.map((url) => url.trim()) ?? ['http://localhost:3000', 'http://localhost:4001', 'http://192.168.1.6:3010', 'https://geekeyy-pricingapp.signatech.com', 'https://geekeyy-pricingapi.signatech.com', 'https://geekeyy-pricingapp-uat.signatech.com', 'https://geekeyy-pricingapi-uat.signatech.com'],
  auth: {
    jwtSecret: process.env['AUTH_JWT_SECRET'] ?? 'Signa',
    accessTokenExpiresIn: process.env['AUTH_JWT_ACCESS_TOKEN_EXPIRES_IN'] ?? '1h',
    refreshTokenExpiresIn: process.env['AUTH_JWT_REFRESH_TOKEN_EXPIRES_IN'] ?? '7d',
    verificationTokenExpiresIn: process.env['AUTH_JWT_VERIFICATION_TOKEN_EXPIRES_IN'] ?? '10h'
  }
};
