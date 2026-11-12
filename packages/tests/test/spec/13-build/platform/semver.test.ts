// #280 — semver core for the platform catalog version history. The registry
// keeps pm's own semver helpers (semverParse/semverCmp/semverSatisfies feed
// registry.ts and config.ts); this suite pins the EXTENDED contract: full
// parse with prerelease, npm prerelease-matching rule, `*` ranges and
// maxSatisfying — everything `name@spec` installs and ranged updates need.

import { describe, expect, test } from "@tsclang/test-engine"
import {
  semverParseFull, semverCmpFull, semverSatisfies, semverMaxSatisfying,
} from "../../../../../pm/src/semver.js"

describe("13-build/platform #280 — semverParseFull", () => {
  test("трёхкомпонентная версия", () => {
    expect(JSON.stringify(semverParseFull("0.4.0"))).toBe(JSON.stringify({ major: 0, minor: 4, patch: 0, prerelease: [] }))
  })

  test("prerelease разбирается на идентификаторы (числа — числами)", () => {
    expect(JSON.stringify(semverParseFull("1.2.3-beta.1"))).toBe(JSON.stringify({ major: 1, minor: 2, patch: 3, prerelease: ["beta", 1] }))
  })

  test("двухкомпонентная нормализуется до patch=0", () => {
    expect(JSON.stringify(semverParseFull("1.2"))).toBe(JSON.stringify({ major: 1, minor: 2, patch: 0, prerelease: [] }))
  })

  test("build-метаданные игнорируются", () => {
    expect(JSON.stringify(semverParseFull("1.2.3+build.7"))).toBe(JSON.stringify({ major: 1, minor: 2, patch: 3, prerelease: [] }))
  })

  test("мусор → null", () => {
    expect(semverParseFull("abc")).toBe(null)
    expect(semverParseFull("")).toBe(null)
    expect(semverParseFull("1.x.3")).toBe(null)
  })
})

describe("13-build/platform #280 — semverCmpFull (semver §11)", () => {
  test("числовое сравнение по сегментам", () => {
    expect(semverCmpFull(semverParseFull("0.10.0")!, semverParseFull("0.9.0")!) > 0).toBe(true)
    expect(semverCmpFull(semverParseFull("0.4.5")!, semverParseFull("0.4.10")!) < 0).toBe(true)
  })

  test("release больше prerelease", () => {
    expect(semverCmpFull(semverParseFull("1.0.0")!, semverParseFull("1.0.0-beta")!) > 0).toBe(true)
  })

  test("цепочка prerelease-порядка semver", () => {
    const chain = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0"]
    for (let i = 1; i < chain.length; i++) {
      expect(semverCmpFull(semverParseFull(chain[i - 1])!, semverParseFull(chain[i])!) < 0).toBe(true)
    }
  })

  test("числовые идентификаторы сравниваются численно, числа < строки", () => {
    expect(semverCmpFull(semverParseFull("1.0.0-2")!, semverParseFull("1.0.0-10")!) < 0).toBe(true)
    expect(semverCmpFull(semverParseFull("1.0.0-2")!, semverParseFull("1.0.0-alpha")!) < 0).toBe(true)
  })

  test("равные версии — и prerelease учитывается", () => {
    expect(semverCmpFull(semverParseFull("1.2.3")!, semverParseFull("1.2.3")!)).toBe(0)
    expect(semverCmpFull(semverParseFull("1.2.3-beta.1")!, semverParseFull("1.2.3-beta.1")!)).toBe(0)
    expect(semverCmpFull(semverParseFull("1.2.3-beta.1")!, semverParseFull("1.2.3-beta.2")!) < 0).toBe(true)
  })
})

describe("13-build/platform #280 — semverSatisfies: операторы", () => {
  test("exact", () => {
    expect(semverSatisfies("1.2.3", "1.2.3")).toBe(true)
    expect(semverSatisfies("1.2.4", "1.2.3")).toBe(false)
    expect(semverSatisfies("1.2.3-beta.1", "1.2.3-beta.1")).toBe(true)
  })

  test("caret ^", () => {
    expect(semverSatisfies("1.5.0", "^1.2.0")).toBe(true)
    expect(semverSatisfies("2.0.0", "^1.2.0")).toBe(false)
    expect(semverSatisfies("1.1.9", "^1.2.0")).toBe(false)
    expect(semverSatisfies("0.4.5", "^0.4.0")).toBe(true)
    expect(semverSatisfies("0.5.0", "^0.4.0")).toBe(false)
    expect(semverSatisfies("0.4.9", "^0.4")).toBe(true)
  })

  test("tilde ~", () => {
    expect(semverSatisfies("1.2.9", "~1.2.3")).toBe(true)
    expect(semverSatisfies("1.3.0", "~1.2.3")).toBe(false)
    expect(semverSatisfies("1.2.2", "~1.2.3")).toBe(false)
  })

  test("comparators >= > <= <", () => {
    expect(semverSatisfies("0.5.0", ">=0.4.0")).toBe(true)
    expect(semverSatisfies("0.3.9", ">=0.4.0")).toBe(false)
    expect(semverSatisfies("0.5.0", ">0.5.0")).toBe(false)
    expect(semverSatisfies("0.5.0", "<=0.5.0")).toBe(true)
    expect(semverSatisfies("0.6.0", "<0.5.0")).toBe(false)
  })

  test("* — любая release-версия", () => {
    expect(semverSatisfies("0.1.0", "*")).toBe(true)
    expect(semverSatisfies("9.9.9", "*")).toBe(true)
  })

  test("мусорная версия не удовлетворяет ничему", () => {
    expect(semverSatisfies("not-a-version", "^1.0.0")).toBe(false)
  })
})

describe("13-build/platform #280 — semverSatisfies: npm-правило prerelease", () => {
  test("prerelease не матчится в диапазон без prerelease", () => {
    expect(semverSatisfies("1.3.0-beta.1", "^1.2.0")).toBe(false)
    expect(semverSatisfies("0.4.0-beta", "^0.4.0")).toBe(false)
    expect(semverSatisfies("1.0.0-rc.1", "*")).toBe(false)
    expect(semverSatisfies("1.0.0-rc.1", ">=0.5.0")).toBe(false)
  })

  test("диапазон с prerelease матчит prerelease той же тройки и её release", () => {
    expect(semverSatisfies("1.2.3-beta.2", "^1.2.3-beta")).toBe(true)
    expect(semverSatisfies("1.2.3", "^1.2.3-beta")).toBe(true)
    expect(semverSatisfies("1.2.4", "^1.2.3-beta")).toBe(true)
  })

  test("диапазон с prerelease не матчит prerelease ДРУГОЙ тройки", () => {
    expect(semverSatisfies("1.3.0-alpha", "^1.2.3-beta")).toBe(false)
  })
})

describe("13-build/platform #280 — semverMaxSatisfying", () => {
  test("старшая в диапазоне", () => {
    expect(semverMaxSatisfying(["0.3.1", "0.4.0", "0.4.5", "0.5.0"], "^0.4")).toBe("0.4.5")
  })

  test("нет удовлетворяющих → null", () => {
    expect(semverMaxSatisfying(["0.3.1"], "^0.4")).toBe(null)
    expect(semverMaxSatisfying([], "*")).toBe(null)
  })

  test("prerelease-версии исключаются из диапазона без prerelease", () => {
    expect(semverMaxSatisfying(["1.0.0", "1.1.0-beta"], "^1.0.0")).toBe("1.0.0")
  })

  test("* — старшая release-версия", () => {
    expect(semverMaxSatisfying(["0.3.1", "0.10.0", "0.9.0"], "*")).toBe("0.10.0")
  })

  test("диапазон с prerelease выбирает старший prerelease", () => {
    expect(semverMaxSatisfying(["1.2.3-beta.1", "1.2.3-beta.2", "1.2.4-beta.1"], "^1.2.3-beta")).toBe("1.2.3-beta.2")
  })

  test("exact-спека выбирает точную версию", () => {
    expect(semverMaxSatisfying(["0.3.1", "0.4.0"], "0.4.0")).toBe("0.4.0")
    expect(semverMaxSatisfying(["0.3.1"], "0.4.0")).toBe(null)
  })
})
