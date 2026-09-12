const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { transformSync } = require("esbuild");

const source = fs.readFileSync(path.join(__dirname, "../src/controllers/order.controller.ts"), "utf8");
const compiled = transformSync(source, { loader: "ts", format: "cjs" }).code;

for (const refund of [null, { refundStatus: "SUCCEEDED", updatedAt: "2026-09-12T10:00:00Z",
  lastError: "private", recoveryOwnerToken: "private", reconciliationOwnerToken: "private", creationDispatched: true }]) {
  test(`GET mine scopes the read and projects only safe refund fields (${refund ? "record" : "null"})`, async () => {
    let reads = 0;
    const prisma = { order: { async findMany(query) {
      reads++;
      assert.equal(query.where.userId, "authenticated-customer");
      assert.deepEqual(Object.keys(query.where), ["userId"]);
      const select = query.include.customerCancellationRefund.select;
      assert.deepEqual(Object.keys(select).sort(), ["refundStatus", "updatedAt"]);
      assert.ok(select.refundStatus && select.updatedAt);
      assert.equal(query.include.offer.include.merchant, true);
      return [{ id: "owned-order", status: "CANCELLED", customerCancellationRefund:
        refund && Object.fromEntries(Object.keys(select).map(key => [key, refund[key]])) }];
    } } };
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
      module, exports: module.exports, process: { env: {} }, console,
      require(name) {
        if (name === "../lib/prisma") return { prisma };
        if (name === "@prisma/client") return { Prisma: { TransactionIsolationLevel: { ReadCommitted: "ReadCommitted" } } };
        // No callable provider/recovery dependencies are supplied.
        return {};
      },
    });
    let result;
    await module.exports.getMyOrders({ userId: "authenticated-customer", body: { userId: "other" }, query: { userId: "other" } }, {
      json(data) { result = data; }, status() { throw Error("Unexpected error response"); },
    });
    assert.equal(reads, 1);
    assert.equal(result.orders[0].id, "owned-order");
    assert.deepEqual(result.orders[0].customerCancellationRefund,
      refund ? { refundStatus: refund.refundStatus, updatedAt: refund.updatedAt } : null);
  });
}
