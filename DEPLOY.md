# EC2 Control Panel — Deploy Guide

## 1. Upload files to your server

Replace the contents of `~/ec2-control-panel/` with these files:

```
ec2-control-panel/
├── server.js
├── scheduler.js
├── package.json
├── routes/
│   ├── auth.js
│   ├── instances.js
│   ├── users.js
│   └── scheduler.js
└── public/
    └── index.html
```

## 2. Install dependencies

```bash
cd ~/ec2-control-panel
npm install
```

## 3. AWS Credentials

### Option A — IAM Instance Role (recommended, no keys needed)
Attach an IAM role to your EC2 instance with this policy:

```json
{
  "Effect": "Allow",
  "Action": [
    "ec2:DescribeInstances",
    "ec2:StartInstances",
    "ec2:StopInstances"
  ],
  "Resource": "*"
}
```

The AWS SDK automatically uses the instance metadata service — no extra config needed.

### Option B — Environment variables
```bash
export AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxxxxx
export AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
export AWS_REGION=us-west-2
```

## 4. Start the server

```bash
# Simple start
node server.js

# Or with pm2 (recommended)
npm install -g pm2
pm2 start server.js --name ec2-panel
pm2 save
pm2 startup
```

## 5. Default login

On first start, a default admin account is created:
- **Email:** admin@example.com  
- **Password:** admin123  

**Change this password immediately** via the Users tab → Delete → re-add with a strong password.

## 6. Migrate existing data (optional)

If you have an existing `panel.db` with users/data, back it up first:
```bash
cp panel.db panel.db.bak
```
The new schema is backward-compatible — it only adds tables if they don't exist.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `SESSION_SECRET` | `ec2-control-secret-change-me` | Session signing key — **change this!** |
| `AWS_REGION` | `us-west-2` | Fallback region if not set per-instance |
