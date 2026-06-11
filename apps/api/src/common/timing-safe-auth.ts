import argon2 from "argon2";

// A real argon2id hash of a throwaway string. When a login hits a nonexistent
// account we verify the supplied password against this instead of returning
// early, so "no such user" and "wrong password" take the same time and the
// endpoint can't be used to enumerate registered emails.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$abOwcWD9/g2HjcOG4L5Hew$np2tjDM0NoP+r5152hpisObsyNnr2lnVLNnA5uQpUFY";

export async function burnPasswordVerification(password: string): Promise<void> {
  await argon2.verify(DUMMY_PASSWORD_HASH, password).catch(() => false);
}
