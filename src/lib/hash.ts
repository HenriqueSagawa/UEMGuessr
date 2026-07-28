import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashValue(value: string): Promise<string> {
    return bcrypt.hash(value, SALT_ROUNDS);
}

export async function compareValue(value: string, hash: string): Promise<boolean> {
  return bcrypt.compare(value, hash);
}