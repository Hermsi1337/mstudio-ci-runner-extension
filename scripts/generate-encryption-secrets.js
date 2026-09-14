#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env");

if (!fs.existsSync(envPath)) {
    console.error("❌ .env file not found");
    process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf8");

const masterPassword = crypto.randomBytes(32).toString("base64");
const salt = crypto.randomBytes(32).toString("hex");

function replaceIfChangeMe(content, key, newValue) {
    const regex = new RegExp(`^${key}=(.*)$`, "m");
    const match = content.match(regex);

    if (!match) {
        console.error(`❌ ${key} not found in .env`);
        process.exit(1);
    }

    const currentValue = match[1];

    if (currentValue !== "changeme") {
        console.log(`ℹ️  ${key} already set, skipping`);
        return content;
    }

    console.log(`✅ ${key} set`);
    return content.replace(regex, `${key}=${newValue}`);
}

let updatedEnv = envContent;
updatedEnv = replaceIfChangeMe(
    updatedEnv,
    "ENCRYPTION_MASTER_PASSWORD",
    masterPassword,
);
updatedEnv = replaceIfChangeMe(updatedEnv, "ENCRYPTION_SALT", salt);

fs.writeFileSync(envPath, updatedEnv, "utf8");

console.log("");
console.log("🔐 Encryption setup finished");
console.log("⚠️  Store ENCRYPTION_MASTER_PASSWORD securely (password manager!)");
