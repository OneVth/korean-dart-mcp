import { fetchNaverPrice } from "../../build/tools/sagyeongin/_lib/naver-price.js";
import { fetchKisRatingBbbMinus5Y } from "../../build/tools/sagyeongin/_lib/kis-rating-scraper.js";

const SAMSUNG = "005930";

const tests = [
  {
    label: "[kisrating] BBB- 5Y",
    run: async () => {
      const r = await fetchKisRatingBbbMinus5Y();
      if (!(r.value >= 0.001 && r.value <= 0.50)) {
        throw new Error(`value=${r.value} outside sanity range [0.001, 0.50]`);
      }
      return `value=${r.value}, raw=${r.raw_percent}, source=${r.source}`;
    },
  },
  {
    label: "[naver]    삼성전자 005930",
    run: async () => {
      const r = await fetchNaverPrice(SAMSUNG);
      if (!(r.price >= 100 && r.price <= 10_000_000)) {
        throw new Error(`price=${r.price} outside sanity range [100, 10000000]`);
      }
      return `price=${r.price}`;
    },
  },
];

let pass = 0;
let fail = 0;

for (const t of tests) {
  console.log(`${t.label}...`);
  try {
    const detail = await t.run();
    console.log(`  PASS  ${detail}`);
    pass++;
  } catch (err) {
    console.log(`  FAIL  ${err.message ?? err}`);
    fail++;
  }
}

console.log();
console.log(`Summary: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
