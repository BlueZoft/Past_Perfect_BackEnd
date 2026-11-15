const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
test("verification, recovery, session revocation, mail delivery and private notifications", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "pastperfect-mail-"),
  );
  process.env.MAIL_DRIVER = "local";
  process.env.MAIL_OUTBOX_DIR = directory;
  process.env.IMAGE_DRIVER = "local";
  process.env.WEB_ORIGIN = "http://localhost:3000";
  process.env.CATALOGUE_FILE = path.join(__dirname, "../config/catalogue.json");
  await mongoose.connect(
    process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017",
    {
      dbName:
        "pastperfect_test_" + require("crypto").randomBytes(8).toString("hex"),
    },
  );
  const app = require("../app"),
    User = require("../models/User"),
    Notification = require("../models/Notification"),
    Session = require("../models/Session"),
    tokens = require("../services/accountTokens");
  await Notification.init();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const request = (method, url, body, cookie) =>
    fetch(base + url, {
      method,
      headers: {
        Origin: process.env.WEB_ORIGIN,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const create = async (name) => {
    const r = await request("POST", "/user/signup", {
      email: name + "@example.invalid",
      username: name,
      password: "old-secure-password",
    });
    assert.equal(r.status, 201);
    return {
      user: await r.json(),
      cookie: r.headers.get("set-cookie").split(";")[0],
    };
  };
  const emails = async () =>
    Promise.all(
      (await fs.readdir(directory)).map(async (file) => ({
        file,
        ...JSON.parse(await fs.readFile(path.join(directory, file), "utf8")),
      })),
    );
  const tokenFrom = (email) =>
    new URLSearchParams(
      new URL(email.text.trim().split("\n").at(-1)).hash.slice(1),
    ).get("token");
  try {
    const buyer = await create("buyer"),
      seller = await create("seller");
    let resetToken;
    await t.test(
      "signup delivers a private local verification message and stores only a digest",
      async () => {
        const mail = (await emails()).find(
          (mail) => mail.to === buyer.user.email,
        );
        assert.ok(mail);
        const token = tokenFrom(mail);
        assert.ok(/^[a-f0-9]{64}$/.test(token));
        const user = await User.findById(buyer.user._id).select(
          "+verificationToken",
        );
        assert.ok(user.verificationToken.digest !== token);
        assert.ok(user.verificationToken.digest === tokens.digest(token));
        assert.equal(buyer.user.verificationToken, undefined);
        assert.equal(buyer.user.emailVerified, false);
        assert.equal(
          (await fs.stat(path.join(directory, mail.file))).mode & 0o777,
          0o600,
        );
      },
    );
    await t.test(
      "verification is single-use and expired links fail",
      async () => {
        const buyerMail = (await emails()).find(
          (mail) => mail.to === buyer.user.email,
        );
        const token = tokenFrom(buyerMail);
        assert.equal(
          (await request("POST", "/user/verification/confirm", { token }))
            .status,
          200,
        );
        assert.equal(
          (await request("POST", "/user/verification/confirm", { token }))
            .status,
          400,
        );
        assert.equal(
          (
            await (
              await request("GET", "/user/me", undefined, buyer.cookie)
            ).json()
          ).emailVerified,
          true,
        );
        const sellerMail = (await emails()).find(
          (mail) => mail.to === seller.user.email,
        );
        await User.updateOne(
          { _id: seller.user._id },
          { $set: { "verificationToken.expiresAt": new Date(0) } },
        );
        assert.equal(
          (
            await request("POST", "/user/verification/confirm", {
              token: tokenFrom(sellerMail),
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "resend uses the requested language without exposing a token",
      async () => {
        const r = await request(
          "POST",
          "/user/verification/request",
          { locale: "ta" },
          seller.cookie,
        );
        assert.equal(r.status, 202);
        assert.equal((await r.json()).token, undefined);
        assert.ok(
          (await emails()).some(
            (mail) =>
              mail.to === seller.user.email &&
              mail.subject.startsWith("உங்கள் PastPerfect"),
          ),
        );
      },
    );
    await t.test(
      "recovery responses do not enumerate accounts and resends invalidate older links",
      async () => {
        const count = (await emails()).length;
        const known = await request("POST", "/user/recovery/request", {
          email: buyer.user.email,
          locale: "si",
        });
        const unknown = await request("POST", "/user/recovery/request", {
          email: "absent@example.invalid",
        });
        assert.equal(known.status, 202);
        assert.equal(unknown.status, 202);
        assert.deepEqual(await known.json(), await unknown.json());
        assert.equal((await emails()).length, count + 1);
        const first = (await emails()).find(
          (mail) =>
            mail.to === buyer.user.email && mail.subject.includes("මුරපදය"),
        );
        const oldToken = tokenFrom(first);
        await request("POST", "/user/recovery/request", {
          email: buyer.user.email,
        });
        const newest = (await emails()).find(
          (mail) =>
            mail.to === buyer.user.email &&
            mail.subject === "Reset your PastPerfect password",
        );
        resetToken = tokenFrom(newest);
        assert.equal(
          (
            await request("POST", "/user/recovery/confirm", {
              token: oldToken,
              password: "new-secure-password",
            })
          ).status,
          400,
        );
        const user = await User.findById(buyer.user._id).select(
          "+recoveryToken",
        );
        assert.ok(user.recoveryToken.digest === tokens.digest(resetToken));
      },
    );
    await t.test(
      "reset is atomic and invalidates all previous sessions",
      async () => {
        assert.equal(
          (
            await request("POST", "/user/recovery/confirm", {
              token: resetToken,
              password: "short",
            })
          ).status,
          400,
        );
        const responses = await Promise.all([
          request("POST", "/user/recovery/confirm", {
            token: resetToken,
            password: "new-secure-password",
          }),
          request("POST", "/user/recovery/confirm", {
            token: resetToken,
            password: "new-secure-password",
          }),
        ]);
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 400]);
        assert.equal(
          (await request("GET", "/user/me", undefined, buyer.cookie)).status,
          401,
        );
        assert.equal(
          (
            await request("POST", "/user/login", {
              email: buyer.user.email,
              password: "old-secure-password",
            })
          ).status,
          401,
        );
        const login = await request("POST", "/user/login", {
          email: buyer.user.email,
          password: "new-secure-password",
        });
        assert.equal(login.status, 200);
        buyer.cookie = login.headers.get("set-cookie").split(";")[0];
        assert.equal((await User.findById(buyer.user._id)).authVersion, 1);
        const stale = "a".repeat(64);
        await Session.create({
          user: buyer.user._id,
          digest: require("../services/session").digest(stale),
          authVersion: 0,
          expiresAt: new Date(Date.now() + 60000),
        });
        assert.equal(
          (await request("GET", "/user/me", undefined, "session=" + stale))
            .status,
          401,
        );
      },
    );
    await t.test("expired recovery links cannot change passwords", async () => {
      await request("POST", "/user/recovery/request", {
        email: seller.user.email,
      });
      const mail = (await emails()).find(
        (mail) =>
          mail.to === seller.user.email &&
          mail.subject === "Reset your PastPerfect password",
      );
      await User.updateOne(
        { _id: seller.user._id },
        { $set: { "recoveryToken.expiresAt": new Date(0) } },
      );
      assert.equal(
        (
          await request("POST", "/user/recovery/confirm", {
            token: tokenFrom(mail),
            password: "another-secure-password",
          })
        ).status,
        400,
      );
    });
    await t.test(
      "message notifications are recipient-only, paginated and independently readable",
      async () => {
        const listing = await require("../models/Offer").create({
          title: "Used book",
          description: "A useful second hand book",
          price: 100,
          condition: "Used",
          owner: seller.user._id,
        });
        const response = await request(
          "POST",
          "/offer/" + listing._id + "/enquiries",
          { message: "Is it available?" },
          buyer.cookie,
        );
        assert.equal(response.status, 201);
        let data = await (
          await request(
            "GET",
            "/user/notifications?limit=1",
            undefined,
            seller.cookie,
          )
        ).json();
        assert.equal(data.count, 1);
        assert.equal(data.unreadCount, 1);
        const notice = data.notifications[0];
        assert.equal(notice.type, "message");
        assert.equal(notice.user, undefined);
        assert.equal(notice.text, undefined);
        assert.equal(
          (
            await request(
              "PATCH",
              "/user/notifications/" + notice._id + "/read",
              undefined,
              buyer.cookie,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await request(
              "PATCH",
              "/user/notifications/" + notice._id + "/read",
              undefined,
              seller.cookie,
            )
          ).status,
          204,
        );
        assert.equal(
          (
            await (
              await request(
                "GET",
                "/user/notifications",
                undefined,
                seller.cookie,
              )
            ).json()
          ).unreadCount,
          0,
        );
        assert.equal((await request("GET", "/user/notifications")).status, 401);
        await request(
          "POST",
          "/user/notifications/read-all",
          undefined,
          buyer.cookie,
        );
        assert.equal(
          (
            await (
              await request(
                "GET",
                "/user/notifications",
                undefined,
                buyer.cookie,
              )
            ).json()
          ).unreadCount,
          0,
        );
      },
    );
    await t.test(
      "mail adapters reject public outboxes and insecure SMTP configuration",
      async () => {
        const mail = require("../services/mail");
        const before = {
          driver: process.env.MAIL_DRIVER,
          outbox: process.env.MAIL_OUTBOX_DIR,
          port: process.env.SMTP_PORT,
          host: process.env.SMTP_HOST,
          user: process.env.SMTP_USER,
          password: process.env.SMTP_PASSWORD,
          from: process.env.MAIL_FROM,
        };
        try {
          process.env.MAIL_DRIVER = "local";
          process.env.MAIL_OUTBOX_DIR = path.join(
            path.resolve(process.env.UPLOAD_DIR || "uploads"),
            "private",
          );
          await assert.rejects(
            mail.send({
              to: "test@example.invalid",
              subject: "Test",
              text: "Test only",
            }),
            { status: 503 },
          );
          process.env.MAIL_DRIVER = "smtp";
          process.env.SMTP_HOST = "smtp.example.invalid";
          process.env.SMTP_USER = "test-only";
          process.env.SMTP_PASSWORD = "test-only";
          process.env.MAIL_FROM = "test@example.invalid";
          process.env.SMTP_PORT = "25";
          await assert.rejects(
            mail.send({
              to: "test@example.invalid",
              subject: "Test",
              text: "Test only",
            }),
            { status: 503 },
          );
        } finally {
          const keys = {
            driver: "MAIL_DRIVER",
            outbox: "MAIL_OUTBOX_DIR",
            port: "SMTP_PORT",
            host: "SMTP_HOST",
            user: "SMTP_USER",
            password: "SMTP_PASSWORD",
            from: "MAIL_FROM",
          };
          for (const [name, key] of Object.entries(keys)) {
            if (before[name] === undefined) delete process.env[key];
            else process.env[key] = before[name];
          }
        }
      },
    );
    await t.test(
      "notification event deduplication and disabled mail fail safely",
      async () => {
        const notify = require("../services/notifications").notify;
        await Promise.all([
          notify(buyer.user._id, "verification", "/profile", "test-event"),
          notify(buyer.user._id, "verification", "/profile", "test-event"),
        ]);
        assert.equal(
          await Notification.countDocuments({
            user: buyer.user._id,
            event: "test-event",
          }),
          1,
        );
        process.env.MAIL_DRIVER = "disabled";
        assert.equal(
          (
            await request(
              "POST",
              "/user/verification/request",
              {},
              seller.cookie,
            )
          ).status,
          503,
        );
        assert.equal(
          (
            await request("POST", "/user/recovery/request", {
              email: buyer.user.email,
            })
          ).status,
          503,
        );
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
