const express = require("express")

const app = express()

app.get("/health", (req, res) => res.json({ ok: true }))
app.use((err, req, res, next) => res.status(500).json({ message: err.message }))

module.exports = app
