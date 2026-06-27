const bcrypt = require("bcryptjs");

const db = require("../lib/db");

const loginPage = (req, res) => {
  if (req.session.userId) {
    return res.redirect("/dashboard");
  }

  let errorMsg = null;
  if (req.query.expired === '1') {
    errorMsg = "Anda belum login atau sesi Anda telah habis. Silakan login kembali.";
  }

  res.render("login", { title: "Login", error: errorMsg });
};

const login = async (req, res, next) => {
  const identifier = (req.body.email || req.body.username || "").trim();
  const password = req.body.password || "";

  if (!identifier || !password) {
    return res.render("login", {
      title: "Login",
      error: "Email dan kata sandi wajib diisi.",
    });
  }

  try {
    const [rows] = await db.query("SELECT * FROM users WHERE email = ? OR name = ?", [
      identifier, identifier
    ]);

    if (rows.length === 0) {
      return res.render("login", {
        title: "Login",
        error: "Email atau kata sandi salah.",
      });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password).catch(() => false);

    if (!isMatch && password !== user.password) {
      return res.render("login", {
        title: "Login",
        error: "Email atau kata sandi salah.",
      });
    }

    req.session.userId = user.id;
    req.session.username = user.name; 

    const permQuery = `
      SELECT DISTINCT p.name
      FROM permissions p
      JOIN role_has_permissions rhp ON rhp.permission_id = p.id
      JOIN model_has_roles mhr ON mhr.role_id = rhp.role_id
      WHERE mhr.model_type = 'App\\\\Models\\\\User'
        AND mhr.model_id = ?
    `;
    const [perms] = await db.query(permQuery, [user.id]);
    req.session.permissions = perms.map(p => p.name);

    res.redirect("/dashboard");
  } catch (err) {
    next(err);
  }
};

const logout = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }
    res.redirect("/login");
  });
};

module.exports = {
  loginPage,
  login,
  logout
};
