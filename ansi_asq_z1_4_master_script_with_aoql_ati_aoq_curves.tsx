import React, { useState, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceDot 
} from 'recharts';

export default function App() {
  // Input State
  const [lotSize, setLotSize] = useState(1200);
  const [inspectionLevel, setInspectionLevel] = useState("II");
  const [targetAQL, setTargetAQL] = useState(0.025);
  const [targetRQL, setTargetRQL] = useState(0.10);
  const [severity, setSeverity] = useState("NORMAL");
  
  // Custom & Interactive View States
  const [customModeActive, setCustomModeActive] = useState(false);
  const [customAQLInput, setCustomAQLInput] = useState("2.5");
  const [customRQLInput, setCustomRQLInput] = useState("10.0");
  const [customLogic3NInput, setCustomLogic3NInput] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [customWebUrl, setCustomWebUrl] = useState("https://your-app-name.vercel.app");

  // Effective AQL determination
  const activeAQL = useMemo(() => {
    if (customModeActive) {
      const val = parseFloat(customAQLInput);
      if (!isNaN(val) && val > 0) {
        return val > 1 ? val / 100 : val;
      }
    }
    return targetAQL;
  }, [customModeActive, customAQLInput, targetAQL]);

  const activeRQL = useMemo(() => {
    if (customModeActive) {
      const val = parseFloat(customRQLInput);
      if (!isNaN(val) && val > 0) {
        return val > 1 ? val / 100 : val;
      }
    }
    return null; // Allows empty value so Logic 2 can inherit from Logic 1
  }, [customModeActive, customRQLInput]);

  // Code Letter lookup
  const codeLetter = useMemo(() => {
    const tableI = [
      [2, 8, "A", "A", "B"], [9, 15, "A", "B", "C"], [16, 25, "B", "C", "D"],
      [26, 50, "C", "D", "E"], [51, 90, "C", "E", "F"], [91, 150, "D", "F", "G"],
      [151, 280, "E", "G", "H"], [281, 500, "F", "H", "J"], [501, 1200, "G", "J", "K"],
      [1201, 3200, "H", "K", "L"], [3201, 10000, "J", "L", "M"], [10001, 35000, "K", "M", "N"],
      [35001, 150000, "L", "N", "P"], [150001, 500000, "M", "P", "Q"], [500001, 99999999, "N", "Q", "R"]
    ];
    let levelIdx = (inspectionLevel === "I") ? 2 : (inspectionLevel === "III" ? 4 : 3);
    for (let i = 0; i < tableI.length; i++) {
      if (lotSize >= tableI[i][0] && lotSize <= tableI[i][1]) return tableI[i][levelIdx];
    }
    return "J";
  }, [lotSize, inspectionLevel]);

  // Statistical / Math helper functions
  const safeFactorial = (num) => {
    if (num < 0) return 1;
    if (num > 170) return Infinity;
    let res = 1;
    for (let i = 2; i <= num; i++) res *= i;
    return res;
  };

  const nCr = (n, r) => {
    if (r < 0 || r > n) return 0;
    if (r === 0 || r === n) return 1;
    if (r > n / 2) r = n - r;
    let res = 1;
    for (let i = 1; i <= r; i++) res = res * (n - i + 1) / i;
    return res;
  };

  const hypergeometricPMF = (k, N, D, n) => {
    let den = nCr(N, n);
    if (den === 0) return 0;
    return (nCr(D, k) * nCr(N - D, n - k)) / den;
  };

  const calculatePa = (N, n, c, p) => {
    let ratio = n / N;
    let Pa = 0;
    if (ratio > 0.1) {
      let D = Math.round(N * p);
      for (let k = 0; k <= c; k++) Pa += hypergeometricPMF(k, N, D, n);
    } else {
      let lambda = n * p;
      for (let k = 0; k <= c; k++) {
        let factK = safeFactorial(k);
        if (factK === Infinity) break;
        Pa += (Math.pow(lambda, k) * Math.exp(-lambda)) / factK;
      }
    }
    return Math.min(Math.max(Pa, 0), 1);
  };

  const calculateSingleRQL = (N, n, c) => {
    let low = 0.0001, high = 0.60, rql = high;
    for (let i = 0; i < 15; i++) {
      let mid = (low + high) / 2;
      if (calculatePa(N, n, c, mid) > 0.10) low = mid;
      else { high = mid; rql = mid; }
    }
    return rql;
  };

  const calculateDoublePaBreakdown = (N, plan, p) => {
    const n1 = plan.n1, n2 = plan.n2, Ac1 = plan.Ac1, Re1 = plan.Re1, Ac2 = plan.Ac2;
    if (n2 === 0 || typeof n2 === 'string') {
      let pa = calculatePa(N, n1, Ac1, p);
      return { pa1: pa, paCombined: pa };
    }

    const ratio = (n1 + n2) / N;
    const D = Math.round(N * p);
    const lambda1 = n1 * p, lambda2 = n2 * p;

    let Pa1 = 0;
    for (let k1 = 0; k1 <= Ac1; k1++) {
      Pa1 += (ratio > 0.1) ? hypergeometricPMF(k1, N, D, n1) : (Math.pow(lambda1, k1) * Math.exp(-lambda1)) / safeFactorial(k1);
    }

    let Pa2 = 0;
    for (let k1 = Ac1 + 1; k1 < Re1; k1++) {
      let p_k1 = (ratio > 0.1) ? hypergeometricPMF(k1, N, D, n1) : (Math.pow(lambda1, k1) * Math.exp(-lambda1)) / safeFactorial(k1);
      let max_k2 = Ac2 - k1;
      let p_k2_cum = 0;
      for (let k2 = 0; k2 <= max_k2; k2++) {
        p_k2_cum += (ratio > 0.1) ? hypergeometricPMF(k2, N - n1, D - k1, n2) : (Math.pow(lambda2, k2) * Math.exp(-lambda2)) / safeFactorial(k2);
      }
      Pa2 += p_k1 * p_k2_cum;
    }

    return { pa1: Math.min(Math.max(Pa1, 0), 1), paCombined: Math.min(Math.max(Pa1 + Pa2, 0), 1) };
  };

  // Solved engine for fixed or baseline Logic 3
  const solveOption3 = (N, level, aqlVal, sev, customN) => {
    let parsedN = parseInt(customN);
    let n;
    if (!isNaN(parsedN) && parsedN > 0) {
      n = Math.min(parsedN, N);
    } else {
      let baseN = getExactNormalSampleSize(codeLetter);
      n = (sev === "REDUCED") ? Math.max(2, Math.floor(baseN * 0.4)) : baseN;
    }
    let c = 0;
    for (let testC = 0; testC <= n; testC++) {
      if (calculatePa(N, n, testC, aqlVal) >= 0.95) { c = testC; break; }
    }
    if (sev === "TIGHTENED") c = Math.max(0, c - 1);
    else if (sev === "REDUCED") c = c + 1;

    return { 
      n: n, 
      c: c, 
      r: c + 1, 
      rql: calculateSingleRQL(N, n, c), 
      paAql: calculatePa(N, n, c, aqlVal), 
      model: n / N > 0.1 ? "Hypergeometric" : "Poisson",
      isCustomN: !isNaN(parsedN) && parsedN > 0
    };
  };

  const calculateDoublePa = (N, plan, p) => {
    return calculateDoublePaBreakdown(N, plan, p).paCombined;
  };

  const calculateDoubleRQL = (N, plan) => {
    let low = 0.0001, high = 0.60, rql = high;
    for (let i = 0; i < 15; i++) {
      let mid = (low + high) / 2;
      if (calculateDoublePa(N, plan, mid) > 0.10) low = mid;
      else { high = mid; rql = mid; }
    }
    return rql;
  };

  // Metrics Helpers: ASN, AOQ, ATI, AOQL
  const calculateSingleASN = (n) => n;
  
  const calculateDoubleASN = (N, plan, p) => {
    if (!plan.n2 || plan.n2 === 0 || typeof plan.n2 === 'string') return plan.n1;
    const ratio = plan.n1 / N;
    const D = Math.round(N * p);
    const lambda1 = plan.n1 * p;
    let p_acc1 = 0;
    for (let k1 = 0; k1 <= plan.Ac1; k1++) {
      p_acc1 += (ratio > 0.1) ? hypergeometricPMF(k1, N, D, plan.n1) : (Math.pow(lambda1, k1) * Math.exp(-lambda1)) / safeFactorial(k1);
    }
    let p_rej1 = 0;
    for (let k1 = plan.Re1; k1 <= plan.n1; k1++) {
      p_rej1 += (ratio > 0.1) ? hypergeometricPMF(k1, N, D, plan.n1) : (Math.pow(lambda1, k1) * Math.exp(-lambda1)) / safeFactorial(k1);
    }
    const p_cont1 = Math.max(0, 1 - p_acc1 - p_rej1);
    return plan.n1 + plan.n2 * p_cont1;
  };

  const calculateSingleMetrics = (N, n, c, p) => {
    const pa = calculatePa(N, n, c, p);
    const aoq = p * pa * (N - n) / N;
    const ati = n + (1 - pa) * (N - n);
    return { pa, aoq, ati };
  };

  const calculateSingleAOQL = (N, n, c) => {
    let maxAOQ = 0;
    for (let p = 0.0005; p <= 0.30; p += 0.0005) {
      const { aoq } = calculateSingleMetrics(N, n, c, p);
      if (aoq > maxAOQ) maxAOQ = aoq;
    }
    return maxAOQ;
  };

  const calculateDoubleMetrics = (N, plan, p) => {
    const { paCombined } = calculateDoublePaBreakdown(N, plan, p);
    const asn = calculateDoubleASN(N, plan, p);
    const aoq = p * paCombined * (N - asn) / N;
    const ati = asn + (1 - paCombined) * (N - asn);
    return { pa: paCombined, aoq, ati, asn };
  };

  const calculateDoubleAOQL = (N, plan) => {
    let maxAOQ = 0;
    for (let p = 0.0005; p <= 0.30; p += 0.0005) {
      const { aoq } = calculateDoubleMetrics(N, plan, p);
      if (aoq > maxAOQ) maxAOQ = aoq;
    }
    return maxAOQ;
  };

  // Normal Sample Sizes
  const getExactNormalSampleSize = (code) => {
    const table = { "A": 2, "B": 3, "C": 5, "D": 8, "E": 13, "F": 20, "G": 32, "H": 50, "J": 80, "K": 125, "L": 200, "M": 315, "N": 500, "P": 800, "Q": 1250 };
    return table[code] || 80;
  };

  const getNormalTableLookup = (code, aqlPct) => {
    let table = {};
    if (aqlPct === 0.1) table = { "H": {Ac: 0, Re: 1}, "J": {Ac: 0, Re: 1}, "K": {Ac: 1, Re: 2}, "L": {Ac: 1, Re: 2}, "M": {Ac: 2, Re: 3} };
    else if (aqlPct === 1.0) table = { "E": {Ac: 0, Re: 1}, "F": {Ac: 0, Re: 1}, "G": {Ac: 1, Re: 2}, "H": {Ac: 1, Re: 2}, "J": {Ac: 2, Re: 3}, "K": {Ac: 3, Re: 4}, "L": {Ac: 5, Re: 6} };
    else if (aqlPct === 1.5) table = { "D": {Ac: 0, Re: 1}, "E": {Ac: 0, Re: 1}, "F": {Ac: 1, Re: 2}, "G": {Ac: 1, Re: 2}, "H": {Ac: 2, Re: 3}, "J": {Ac: 3, Re: 4}, "K": {Ac: 5, Re: 6} };
    else if (aqlPct === 2.5) table = { "C": {Ac: 0, Re: 1}, "D": {Ac: 0, Re: 1}, "E": {Ac: 1, Re: 2}, "F": {Ac: 1, Re: 2}, "G": {Ac: 2, Re: 3}, "H": {Ac: 3, Re: 4}, "J": {Ac: 5, Re: 6}, "K": {Ac: 7, Re: 8}, "L": {Ac: 10, Re: 11} };
    else if (aqlPct === 4.0) table = { "B": {Ac: 0, Re: 1}, "C": {Ac: 0, Re: 1}, "D": {Ac: 1, Re: 2}, "E": {Ac: 1, Re: 2}, "F": {Ac: 2, Re: 3}, "G": {Ac: 3, Re: 4}, "H": {Ac: 5, Re: 6}, "J": {Ac: 7, Re: 8} };
    else if (aqlPct === 6.5) table = { "A": {Ac: 0, Re: 1}, "B": {Ac: 0, Re: 1}, "C": {Ac: 1, Re: 2}, "D": {Ac: 1, Re: 2}, "E": {Ac: 2, Re: 3}, "F": {Ac: 3, Re: 4}, "G": {Ac: 5, Re: 6}, "H": {Ac: 7, Re: 8} };
    return table[code] || null;
  };

  const solveOption1 = (N, level, aqlVal, sev) => {
    let baseN = getExactNormalSampleSize(codeLetter);
    let n = (sev === "REDUCED") ? Math.max(2, Math.floor(baseN * 0.4)) : baseN;
    let c = 0;
    for (let testC = 0; testC <= n; testC++) {
      if (calculatePa(N, n, testC, aqlVal) >= 0.95) { c = testC; break; }
    }
    if (sev === "TIGHTENED") c = Math.max(0, c - 1);
    else if (sev === "REDUCED") c = c + 1;

    return { n: n, c: c, r: c + 1, rql: calculateSingleRQL(N, n, c), paAql: calculatePa(N, n, c, aqlVal), model: n / N > 0.1 ? "Hypergeometric" : "Poisson" };
  };

  const designDoublePlanFromSingle = (singleN, singleC, p1, alpha, p2, beta, N, sev) => {
    let n1 = Math.max(2, Math.round(singleN * 0.63));
    let n2 = n1;
    let bestPlan = { n1: n1, n2: n2, Ac1: Math.max(0, Math.floor(singleC / 2)), Re1: singleC + 1, Ac2: singleC, Re2: singleC + 1 };
    return {
      n1: bestPlan.n1, n2: bestPlan.n2,
      Ac1: bestPlan.Ac1, Re1: bestPlan.Re1,
      Ac2: bestPlan.Ac2, Re2: bestPlan.Re2,
      rql: calculateDoubleRQL(N, bestPlan), paAql: calculateDoublePa(N, bestPlan, p1),
      model: ((n1 + n2) / N > 0.1) ? "Hypergeometric" : "Poisson"
    };
  };

  // Lookup Single Plan
  const lookupSingle = useMemo(() => {
    let aqlPct = activeAQL * 100;
    if (severity === "NORMAL") {
      let n = getExactNormalSampleSize(codeLetter);
      let tPlan = getNormalTableLookup(codeLetter, aqlPct);
      if (tPlan) return { n: n, Ac: tPlan.Ac, Re: tPlan.Re, effectiveCode: codeLetter };
    }
    return solveOption1(lotSize, inspectionLevel, activeAQL, severity);
  }, [codeLetter, activeAQL, severity, lotSize, inspectionLevel]);

  const lookupSingleRql = useMemo(() => calculateSingleRQL(lotSize, lookupSingle.n, lookupSingle.Ac), [lotSize, lookupSingle]);
  const lookupSinglePaAql = useMemo(() => calculatePa(lotSize, lookupSingle.n, lookupSingle.Ac, activeAQL), [lotSize, lookupSingle, activeAQL]);
  
  // Single Metrics at AQL & AOQL
  const lookupSingleMetricsAtAQL = useMemo(() => calculateSingleMetrics(lotSize, lookupSingle.n, lookupSingle.Ac, activeAQL), [lotSize, lookupSingle, activeAQL]);
  const lookupSingleAOQL = useMemo(() => calculateSingleAOQL(lotSize, lookupSingle.n, lookupSingle.Ac), [lotSize, lookupSingle]);

  // Lookup Double Plan
  const lookupDouble = useMemo(() => {
    let aqlPct = activeAQL * 100;
    let table = {};
    if (severity === "NORMAL" && aqlPct === 2.5) {
      table = {
        "A": {n1: 2, n2: 2, Ac1: 0, Re1: 1, Ac2: 0, Re2: 1, code: "C"},
        "B": {n1: 2, n2: 2, Ac1: 0, Re1: 1, Ac2: 0, Re2: 1, code: "C"},
        "C": {n1: 3, n2: 3, Ac1: 0, Re1: 1, Ac2: 1, Re2: 2, code: "C"},
        "D": {n1: 5, n2: 5, Ac1: 0, Re1: 1, Ac2: 1, Re2: 2, code: "D"},
        "E": {n1: 8, n2: 8, Ac1: 0, Re1: 2, Ac2: 1, Re2: 2, code: "E"},
        "F": {n1: 13, n2: 13, Ac1: 0, Re1: 2, Ac2: 1, Re2: 2, code: "F"},
        "G": {n1: 20, n2: 20, Ac1: 0, Re1: 3, Ac2: 3, Re2: 4, code: "G"},
        "H": {n1: 32, n2: 32, Ac1: 1, Re1: 4, Ac2: 4, Re2: 5, code: "H"},
        "J": {n1: 50, n2: 50, Ac1: 2, Re1: 5, Ac2: 6, Re2: 7, code: "J"},
        "K": {n1: 80, n2: 80, Ac1: 3, Re1: 7, Ac2: 8, Re2: 9, code: "K"},
        "L": {n1: 125, n2: 125, Ac1: 5, Re1: 9, Ac2: 12, Re2: 13, code: "L"},
        "M": {n1: 200, n2: 200, Ac1: 7, Re1: 11, Ac2: 18, Re2: 19, code: "M"}
      };
    }
    let entry = table[codeLetter];
    if (!entry) {
      return designDoublePlanFromSingle(lookupSingle.n, lookupSingle.Ac, activeAQL, 0.05, activeRQL, 0.10, lotSize, severity);
    }
    let planObj = { n1: entry.n1, n2: entry.n2, Ac1: entry.Ac1, Re1: entry.Re1, Ac2: entry.Ac2, Re2: entry.Re2 };
    return {
      n1: entry.n1, n2: entry.n2,
      Ac1: entry.Ac1, Re1: entry.Re1,
      Ac2: entry.Ac2, Re2: entry.Re2,
      rql: calculateDoubleRQL(lotSize, planObj),
      paAql: calculateDoublePa(lotSize, planObj, activeAQL),
      model: ((entry.n1 + entry.n2) / lotSize > 0.1) ? "Hypergeometric" : "Poisson",
      effectiveCode: entry.code || codeLetter
    };
  }, [codeLetter, activeAQL, activeRQL, severity, lotSize, lookupSingle]);

  // Double Metrics at AQL & AOQL
  const lookupDoubleMetricsAtAQL = useMemo(() => calculateDoubleMetrics(lotSize, lookupDouble, activeAQL), [lotSize, lookupDouble, activeAQL]);
  const lookupDoubleAOQL = useMemo(() => calculateDoubleAOQL(lotSize, lookupDouble), [lotSize, lookupDouble]);

  // Math Options
  const mathOptions = useMemo(() => {
    const opt1Single = solveOption1(lotSize, inspectionLevel, activeAQL, severity);
    const opt1SingleAoql = calculateSingleAOQL(lotSize, opt1Single.n, opt1Single.c);
    const opt1SingleAti = calculateSingleMetrics(lotSize, opt1Single.n, opt1Single.c, activeAQL).ati;

    const opt1Double = designDoublePlanFromSingle(opt1Single.n, opt1Single.c, activeAQL, 0.05, targetRQL, 0.10, lotSize, severity);
    const opt1DoubleAoql = calculateDoubleAOQL(lotSize, opt1Double);
    const opt1DoubleAti = calculateDoubleMetrics(lotSize, opt1Double, activeAQL).ati;

    // Logic 2: Inherits RQL from Logic 1 if custom RQL input is empty or null
    const effectiveLogic2RQL = (activeRQL !== null && activeRQL > 0) ? activeRQL : opt1Single.rql;

    const opt2Single = solveOption1(lotSize, inspectionLevel, activeAQL, severity);
    const opt2SingleAoql = calculateSingleAOQL(lotSize, opt2Single.n, opt2Single.c);
    const opt2SingleAti = calculateSingleMetrics(lotSize, opt2Single.n, opt2Single.c, activeAQL).ati;

    const opt2Double = designDoublePlanFromSingle(opt1Single.n, opt1Single.c, activeAQL, 0.05, effectiveLogic2RQL, 0.10, lotSize, severity);
    const opt2DoubleAoql = calculateDoubleAOQL(lotSize, opt2Double);
    const opt2DoubleAti = calculateDoubleMetrics(lotSize, opt2Double, activeAQL).ati;

    // Logic 3: Custom sample size n (if provided) or dynamic baseline
    const opt3Single = solveOption3(lotSize, inspectionLevel, activeAQL, severity, customModeActive ? customLogic3NInput : "");
    const opt3SingleAoql = calculateSingleAOQL(lotSize, opt3Single.n, opt3Single.c);
    const opt3SingleAti = calculateSingleMetrics(lotSize, opt3Single.n, opt3Single.c, activeAQL).ati;

    const opt3Double = designDoublePlanFromSingle(opt3Single.n, opt3Single.c, activeAQL, 0.05, activeRQL, 0.10, lotSize, severity);
    const opt3DoubleAoql = calculateDoubleAOQL(lotSize, opt3Double);
    const opt3DoubleAti = calculateDoubleMetrics(lotSize, opt3Double, activeAQL).ati;

    return { 
      opt1: opt1Single,
      opt2: opt2Double,
      opt3: opt3Single,
      opt1Single: { ...opt1Single, aoql: opt1SingleAoql, ati: opt1SingleAti },
      opt1Double: { ...opt1Double, aoql: opt1DoubleAoql, ati: opt1DoubleAti },
      opt2Single: { ...opt2Single, aoql: opt2SingleAoql, ati: opt2SingleAti },
      opt2Double: { ...opt2Double, aoql: opt2DoubleAoql, ati: opt2DoubleAti },
      opt3Single: { ...opt3Single, aoql: opt3SingleAoql, ati: opt3SingleAti },
      opt3Double: { ...opt3Double, aoql: opt3DoubleAoql, ati: opt3DoubleAti }
    };
  }, [lotSize, inspectionLevel, activeAQL, activeRQL, severity, customModeActive, customLogic3NInput, codeLetter, targetRQL]);

  // High-Resolution Smooth Chart Data (OC & AOQ Curves)
  const chartData = useMemo(() => {
    const pPoints = [];
    for (let p = 0.0005; p <= 0.20; p += 0.001) {
      pPoints.push(parseFloat(p.toFixed(4)));
    }
    const uniquePSet = new Set(pPoints);
    uniquePSet.add(activeAQL);
    uniquePSet.add(lookupSingleRql);
    if (typeof lookupDouble.rql === 'number') uniquePSet.add(lookupDouble.rql);

    const sortedP = Array.from(uniquePSet).sort((a, b) => a - b);

    return sortedP.map(p => {
      const singleMet = calculateSingleMetrics(lotSize, lookupSingle.n, lookupSingle.Ac, p);
      const dBreakdown = calculateDoublePaBreakdown(lotSize, lookupDouble, p);
      const doubleMet = calculateDoubleMetrics(lotSize, lookupDouble, p);

      const opt1SingleMet = calculateSingleMetrics(lotSize, mathOptions.opt1Single.n, mathOptions.opt1Single.c, p);
      const opt1DoubleMet = calculateDoubleMetrics(lotSize, mathOptions.opt1Double, p);
      const opt2SingleMet = calculateSingleMetrics(lotSize, mathOptions.opt2Single.n, mathOptions.opt2Single.c, p);
      const opt2DoubleMet = calculateDoubleMetrics(lotSize, mathOptions.opt2Double, p);
      const opt3SingleMet = calculateSingleMetrics(lotSize, mathOptions.opt3Single.n, mathOptions.opt3Single.c, p);
      const opt3DoubleMet = calculateDoubleMetrics(lotSize, mathOptions.opt3Double, p);

      return {
        p: p,
        paSingle: singleMet.pa * 100,
        paDoubleFirst: dBreakdown.pa1 * 100,
        paDoubleComb: dBreakdown.paCombined * 100,
        aoqSingle: singleMet.aoq * 100,
        aoqDouble: doubleMet.aoq * 100,

        paOpt1Single: opt1SingleMet.pa * 100,
        paOpt1Double: opt1DoubleMet.pa * 100,
        paOpt2Single: opt2SingleMet.pa * 100,
        paOpt2Double: opt2DoubleMet.pa * 100,
        paOpt3Single: opt3SingleMet.pa * 100,
        paOpt3Double: opt3DoubleMet.pa * 100,

        aoqOpt1Single: opt1SingleMet.aoq * 100,
        aoqOpt1Double: opt1DoubleMet.aoq * 100,
        aoqOpt2Single: opt2SingleMet.aoq * 100,
        aoqOpt2Double: opt2DoubleMet.aoq * 100,
        aoqOpt3Single: opt3SingleMet.aoq * 100,
        aoqOpt3Double: opt3DoubleMet.aoq * 100
      };
    });
  }, [lotSize, lookupSingle, lookupDouble, activeAQL, lookupSingleRql, mathOptions]);

  // Target Markers Coordinates
  const singleAqlMarker = useMemo(() => ({ x: activeAQL, y: lookupSinglePaAql * 100 }), [activeAQL, lookupSinglePaAql]);
  const singleRqlMarker = useMemo(() => ({ x: lookupSingleRql, y: calculatePa(lotSize, lookupSingle.n, lookupSingle.Ac, lookupSingleRql) * 100 }), [lotSize, lookupSingle, lookupSingleRql]);
  const doubleCombAqlMarker = useMemo(() => ({ x: activeAQL, y: lookupDouble.paAql * 100 }), [activeAQL, lookupDouble]);
  const doubleCombRqlMarker = useMemo(() => ({ x: lookupDouble.rql, y: calculateDoublePa(lotSize, lookupDouble, lookupDouble.rql) * 100 }), [lotSize, lookupDouble]);

  // Custom Mode Reference Markers for Recommended Plans
  const opt1AqlMarker = useMemo(() => ({ x: activeAQL, y: mathOptions.opt1.paAql * 100 }), [activeAQL, mathOptions]);
  const opt1RqlMarker = useMemo(() => ({ x: mathOptions.opt1.rql, y: calculatePa(lotSize, mathOptions.opt1.n, mathOptions.opt1.c, mathOptions.opt1.rql) * 100 }), [lotSize, mathOptions]);
  const opt2AqlMarker = useMemo(() => ({ x: activeAQL, y: mathOptions.opt2Double.paAql * 100 }), [activeAQL, mathOptions]);
  const opt2RqlMarker = useMemo(() => ({ x: mathOptions.opt2Double.rql, y: calculateDoublePa(lotSize, mathOptions.opt2Double, mathOptions.opt2Double.rql) * 100 }), [lotSize, mathOptions]);

  // AOQL Peak Max Point Markers
  const singleAoqlPeakMarker = useMemo(() => {
    let maxPt = { p: 0, aoq: 0 };
    chartData.forEach(item => {
      if (item.aoqSingle > maxPt.aoq) maxPt = { p: item.p, aoq: item.aoqSingle };
    });
    return maxPt;
  }, [chartData]);

  const doubleAoqlPeakMarker = useMemo(() => {
    let maxPt = { p: 0, aoq: 0 };
    chartData.forEach(item => {
      if (item.aoqDouble > maxPt.aoq) maxPt = { p: item.p, aoq: item.aoqDouble };
    });
    return maxPt;
  }, [chartData]);

  const opt1AoqlPeakMarker = useMemo(() => {
    let maxPt = { p: 0, aoq: 0 };
    chartData.forEach(item => {
      if (item.aoqOpt1Single > maxPt.aoq) maxPt = { p: item.p, aoq: item.aoqOpt1Single };
    });
    return maxPt;
  }, [chartData]);

  const opt2SingleAoqlPeakMarker = useMemo(() => {
    let maxPt = { p: 0, aoq: 0 };
    chartData.forEach(item => {
      if (item.aoqOpt2Single > maxPt.aoq) maxPt = { p: item.p, aoq: item.aoqOpt2Single };
    });
    return maxPt;
  }, [chartData]);

  const opt2DoubleAoqlPeakMarker = useMemo(() => {
    let maxPt = { p: 0, aoq: 0 };
    chartData.forEach(item => {
      if (item.aoqOpt2Double > maxPt.aoq) maxPt = { p: item.p, aoq: item.aoqOpt2Double };
    });
    return maxPt;
  }, [chartData]);

  const opt3AoqlPeakMarker = useMemo(() => {
    let maxPt = { p: 0, aoq: 0 };
    chartData.forEach(item => {
      if (item.aoqOpt3Single > maxPt.aoq) maxPt = { p: item.p, aoq: item.aoqOpt3Single };
    });
    return maxPt;
  }, [chartData]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* HEADER */}
        <div className="bg-slate-900 text-white rounded-xl p-6 shadow-md flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ANSI/ASQ Z1.4 Master Sampling Calculator</h1>
            <p className="text-slate-400 text-sm mt-1">Interactive Sampling Plans, Operating Characteristic Curves & Severity Calculations</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button 
              onClick={() => setShowDonateModal(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 text-white rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2"
            >
              <span>☕ Donate & Contact</span>
            </button>

            {customModeActive && (
              <button 
                onClick={() => setCustomModeActive(false)}
                className="px-3 py-2.5 bg-rose-600/80 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-md transition-all flex items-center gap-1.5"
              >
                <span>✕ Exit Custom Mode</span>
              </button>
            )}
            <button 
              onClick={() => setShowModal(true)}
              className={`px-4 py-2.5 rounded-lg text-sm font-semibold shadow-md transition-all flex items-center gap-2 ${
                customModeActive ? 'bg-purple-600 hover:bg-purple-700 text-white ring-2 ring-purple-300' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
              }`}
            >
              <span>{customModeActive ? '⚙️ Custom AQL/RQL Mode: Active' : '⚙️ Custom Plan Generator'}</span>
            </button>
          </div>
        </div>

        {/* INPUT PARAMETERS TOOLBAR */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between border-b pb-3 mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <span>🎛️ Inspection Input Parameters</span>
              {customModeActive && (
                <span className="normal-case text-xs font-semibold bg-purple-100 text-purple-700 px-2.5 py-0.5 rounded-full">
                  Custom Mode Active (Target AQL Controlled via Modal)
                </span>
              )}
            </h2>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Lot Size Input */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Lot Size (N)</label>
              <input 
                type="number" 
                min="1"
                value={lotSize} 
                onChange={(e) => setLotSize(Math.max(1, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Inspection Level Input */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Inspection Level</label>
              <select 
                value={inspectionLevel} 
                onChange={(e) => setInspectionLevel(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
              >
                <option value="I">General Level I</option>
                <option value="II">General Level II (Default)</option>
                <option value="III">General Level III</option>
                <option value="S-1">Special Level S-1</option>
                <option value="S-2">Special Level S-2</option>
                <option value="S-3">Special Level S-3</option>
                <option value="S-4">Special Level S-4</option>
              </select>
            </div>

            {/* Inspection Severity Input */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Severity</label>
              <select 
                value={severity} 
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
              >
                <option value="NORMAL">NORMAL</option>
                <option value="TIGHTENED">TIGHTENED</option>
                <option value="REDUCED">REDUCED</option>
              </select>
            </div>

            {/* Target AQL Dropdown - Hidden in Custom Mode */}
            {!customModeActive ? (
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Target AQL (%)</label>
                <select 
                  value={targetAQL} 
                  onChange={(e) => setTargetAQL(parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-blue-500 bg-blue-50/30 rounded-lg text-sm font-bold text-blue-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value={0.001}>0.10%</option>
                  <option value={0.010}>1.00%</option>
                  <option value={0.015}>1.50%</option>
                  <option value={0.025}>2.50%</option>
                  <option value={0.040}>4.00%</option>
                  <option value={0.065}>6.50%</option>
                </select>
              </div>
            ) : (
              <div className="bg-purple-50 p-2.5 rounded-lg border border-purple-200 flex flex-col justify-center">
                <span className="text-[11px] font-bold text-purple-600 uppercase">Active Custom AQL</span>
                <span className="text-sm font-bold text-purple-900">{(activeAQL * 100).toFixed(2)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* PRIMARY OUTPUT SECTION (Table Lookup) - Hidden when Custom Mode is active */}
        {!customModeActive ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Single Sampling Plan Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center border-b pb-3 mb-4">
                  <h2 className="font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-3 h-3 bg-blue-600 rounded-full inline-block"></span>
                    Table Lookup Single Plan ({severity})
                  </h2>
                  <span className="text-xs font-bold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">Code {lookupSingle.effectiveCode || codeLetter}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 text-center">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="block text-xs text-slate-500 font-semibold">Sample (n)</span>
                    <span className="text-lg font-bold text-slate-900">{lookupSingle.n}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="block text-xs text-slate-500 font-semibold">Accept (Ac)</span>
                    <span className="text-lg font-bold text-emerald-600">{lookupSingle.Ac}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="block text-xs text-slate-500 font-semibold">Reject (Re)</span>
                    <span className="text-lg font-bold text-red-600">{lookupSingle.Re}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="block text-xs text-slate-500 font-semibold">Model</span>
                    <span className="text-xs font-bold text-slate-700 mt-1 block">{lookupSingle.n / lotSize > 0.1 ? "Hypergeom." : "Poisson"}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 text-sm">
                <div className="flex justify-between bg-blue-50/50 p-2.5 rounded">
                  <span className="text-slate-600 font-medium">Calculated RQL:</span>
                  <span className="font-bold text-blue-900">{(lookupSingleRql * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between bg-emerald-50/50 p-2.5 rounded">
                  <span className="text-slate-600 font-medium">Pa at AQL:</span>
                  <span className="font-bold text-emerald-900">{(lookupSinglePaAql * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between bg-indigo-50/50 p-2.5 rounded">
                  <span className="text-slate-600 font-medium">AOQL:</span>
                  <span className="font-bold text-indigo-900">{(lookupSingleAOQL * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between bg-teal-50/50 p-2.5 rounded">
                  <span className="text-slate-600 font-medium">ATI (at AQL):</span>
                  <span className="font-bold text-teal-900">{Math.round(lookupSingleMetricsAtAQL.ati)}</span>
                </div>
              </div>
            </div>

            {/* Double Sampling Plan Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center border-b pb-3 mb-4">
                  <h2 className="font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-3 h-3 bg-amber-500 rounded-full inline-block"></span>
                    Table Lookup Double Plan ({severity})
                  </h2>
                  <span className="text-xs font-bold bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full">Code {lookupDouble.effectiveCode || codeLetter}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 text-center">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="block text-xs text-slate-500 font-semibold">Sample (n1 / n2)</span>
                    <span className="text-md font-bold text-slate-900">{lookupDouble.n1} / {lookupDouble.n2}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="block text-xs text-slate-500 font-semibold">Accept (Ac1 / Ac2)</span>
                    <span className="text-md font-bold text-emerald-600">{lookupDouble.Ac1} / {lookupDouble.Ac2}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="block text-xs text-slate-500 font-semibold">Reject (Re1 / Re2)</span>
                    <span className="text-md font-bold text-red-600">{lookupDouble.Re1} / {lookupDouble.Re2}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="block text-xs text-slate-500 font-semibold">Model</span>
                    <span className="text-xs font-bold text-slate-700 mt-1 block">{lookupDouble.model}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 text-sm">
                <div className="flex justify-between bg-blue-50/50 p-2.5 rounded">
                  <span className="text-slate-600 font-medium">Calculated RQL:</span>
                  <span className="font-bold text-blue-900">{(lookupDouble.rql * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between bg-emerald-50/50 p-2.5 rounded">
                  <span className="text-slate-600 font-medium">Pa at AQL:</span>
                  <span className="font-bold text-emerald-900">{(lookupDouble.paAql * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between bg-indigo-50/50 p-2.5 rounded">
                  <span className="text-slate-600 font-medium">AOQL:</span>
                  <span className="font-bold text-indigo-900">{(lookupDoubleAOQL * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between bg-teal-50/50 p-2.5 rounded">
                  <span className="text-slate-600 font-medium">ATI (at AQL):</span>
                  <span className="font-bold text-teal-900">{Math.round(lookupDoubleMetricsAtAQL.ati)}</span>
                </div>
              </div>
            </div>

          </div>
        ) : null}

        {/* OTHERS PLAN TOGGLE BUTTON */}
        {!customModeActive && (
          <div className="flex justify-center pt-2">
            <button 
              onClick={() => setShowOthers(!showOthers)}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-semibold shadow transition-all flex items-center gap-2"
            >
              <span>{showOthers ? '▲ Hide Others Plan (Mathematical Options)' : '▼ Others Plan (Mathematical Options)'}</span>
            </button>
          </div>
        )}

        {/* OTHERS PLAN SECTION (Math Engine Options 1, 2, 3) - Automatically visible in Custom Mode */}
        {(showOthers || customModeActive) && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6 animate-fadeIn">
            <h3 className="text-lg font-bold text-slate-800 border-b pb-2 flex items-center justify-between">
              <span>{customModeActive ? 'Custom Mathematical Sampling Plans (6 Recommended Plans)' : 'Mathematical Severity & Custom Engine Options'}</span>
              {customModeActive && (
                <span className="text-xs font-bold bg-purple-100 text-purple-800 px-3 py-1 rounded-full">Custom Mode Active</span>
              )}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              
              {/* Option 1 Single */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <span className="text-xs font-bold text-blue-700 uppercase bg-blue-100 px-2 py-0.5 rounded">Logic 1: Standard Severity Single</span>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-600">Sample (n):</span><span className="font-bold">{mathOptions.opt1Single.n}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Accept (c):</span><span className="font-bold text-emerald-600">{mathOptions.opt1Single.c}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Reject (r):</span><span className="font-bold text-red-600">{mathOptions.opt1Single.r}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Calculated RQL:</span><span className="font-bold">{(mathOptions.opt1Single.rql * 100).toFixed(2)}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Pa(AQL):</span><span className="font-bold">{(mathOptions.opt1Single.paAql * 100).toFixed(2)}%</span></div>
                  <div className="flex justify-between border-t pt-1"><span className="text-slate-600 font-medium">AOQL:</span><span className="font-bold text-indigo-700">{(mathOptions.opt1Single.aoql * 100).toFixed(2)}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-600 font-medium">ATI (at AQL):</span><span className="font-bold text-teal-700">{Math.round(mathOptions.opt1Single.ati)}</span></div>
                </div>
              </div>

              {/* Option 1 Double */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <span className="text-xs font-bold text-blue-700 uppercase bg-blue-100 px-2 py-0.5 rounded">Logic 1: Standard Severity Double</span>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-600">Sample (n1/n2):</span><span className="font-bold">{mathOptions.opt1Double.n1} / {mathOptions.opt1Double.n2}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Accept (c1/c2):</span><span className="font-bold text-emerald-600">{mathOptions.opt1Double.Ac1} / {mathOptions.opt1Double.Ac2}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Reject (r1/r2):</span><span className="font-bold text-red-600">{mathOptions.opt1Double.Re1} / {mathOptions.opt1Double.Re2}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Calculated RQL:</span><span className="font-bold">{(mathOptions.opt1Double.rql * 100).toFixed(2)}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Pa(AQL):</span><span className="font-bold">{(mathOptions.opt1Double.paAql * 100).toFixed(2)}%</span></div>
                  <div className="flex justify-between border-t pt-1"><span className="text-slate-600 font-medium">AOQL:</span><span className="font-bold text-indigo-700">{(mathOptions.opt1Double.aoql * 100).toFixed(2)}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-600 font-medium">ATI (at AQL):</span><span className="font-bold text-teal-700">{Math.round(mathOptions.opt1Double.ati)}</span></div>
                </div>
              </div>

              {/* Option 2 Single */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <span className="text-xs font-bold text-pink-700 uppercase bg-pink-100 px-2 py-0.5 rounded">Logic 2: Custom RQL Single</span>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-600">Sample (n):</span><span className="font-bold">{mathOptions.opt2Single.n}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Accept (c):</span><span className="font-bold text-emerald-600">{mathOptions.opt2Single.c}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Reject (r):</span><span className="font-bold text-red-600">{mathOptions.opt2Single.r}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">RQL:</span><span className="font-bold">{(mathOptions.opt2Single.rql * 100).toFixed(2)}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Pa(AQL):</span><span className="font-bold">{(mathOptions.opt2Single.paAql * 100).toFixed(2)}%</span></div>
                  <div className="flex justify-between border-t pt-1"><span className="text-slate-600 font-medium">AOQL:</span><span className="font-bold text-indigo-700">{(mathOptions.opt2Single.aoql * 100).toFixed(2)}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-600 font-medium">ATI (at AQL):</span><span className="font-bold text-teal-700">{Math.round(mathOptions.opt2Single.ati)}</span></div>
                </div>
              </div>

              {/* Option 2 Double */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <span className="text-xs font-bold text-purple-700 uppercase bg-purple-100 px-2 py-0.5 rounded">Logic 2: Custom RQL Double</span>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-600">Sample (n1/n2):</span><span className="font-bold">{mathOptions.opt2Double.n1} / {mathOptions.opt2Double.n2}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Accept (c1/c2):</span><span className="font-bold text-emerald-600">{mathOptions.opt2Double.Ac1} / {mathOptions.opt2Double.Ac2}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Reject (r1/r2):</span><span className="font-bold text-red-600">{mathOptions.opt2Double.Re1} / {mathOptions.opt2Double.Re2}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">RQL:</span><span className="font-bold">{(mathOptions.opt2Double.rql * 100).toFixed(2)}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Pa(AQL):</span><span className="font-bold">{(mathOptions.opt2Double.paAql * 100).toFixed(2)}%</span></div>
                  <div className="flex justify-between border-t pt-1"><span className="text-slate-600 font-medium">AOQL:</span><span className="font-bold text-indigo-700">{(mathOptions.opt2Double.aoql * 100).toFixed(2)}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-600 font-medium">ATI (at AQL):</span><span className="font-bold text-teal-700">{Math.round(mathOptions.opt2Double.ati)}</span></div>
                </div>
              </div>

              {/* Option 3 Single */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-700 uppercase bg-emerald-100 px-2 py-0.5 rounded">Logic 3: Fixed Engine Single</span>
                  {mathOptions.opt3Single.isCustomN && (
                    <span className="text-[10px] font-extrabold bg-emerald-600 text-white px-2 py-0.5 rounded-full uppercase">Custom n</span>
                  )}
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-600">Sample (n):</span><span className="font-bold text-emerald-800">{mathOptions.opt3Single.n}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Accept (c):</span><span className="font-bold text-emerald-600">{mathOptions.opt3Single.c}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Reject (r):</span><span className="font-bold text-red-600">{mathOptions.opt3Single.r}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">RQL:</span><span className="font-bold">{(mathOptions.opt3Single.rql * 100).toFixed(2)}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Pa(AQL):</span><span className="font-bold">{(mathOptions.opt3Single.paAql * 100).toFixed(2)}%</span></div>
                  <div className="flex justify-between border-t pt-1"><span className="text-slate-600 font-medium">AOQL:</span><span className="font-bold text-indigo-700">{(mathOptions.opt3Single.aoql * 100).toFixed(2)}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-600 font-medium">ATI (at AQL):</span><span className="font-bold text-teal-700">{Math.round(mathOptions.opt3Single.ati)}</span></div>
                </div>
              </div>

              {/* Option 3 Double */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <span className="text-xs font-bold text-emerald-700 uppercase bg-emerald-100 px-2 py-0.5 rounded">Logic 3: Fixed Engine Double</span>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-600">Sample (n1/n2):</span><span className="font-bold">{mathOptions.opt3Double.n1} / {mathOptions.opt3Double.n2}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Accept (c1/c2):</span><span className="font-bold text-emerald-600">{mathOptions.opt3Double.Ac1} / {mathOptions.opt3Double.Ac2}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Reject (r1/r2):</span><span className="font-bold text-red-600">{mathOptions.opt3Double.Re1} / {mathOptions.opt3Double.Re2}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">RQL:</span><span className="font-bold">{(mathOptions.opt3Double.rql * 100).toFixed(2)}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Pa(AQL):</span><span className="font-bold">{(mathOptions.opt3Double.paAql * 100).toFixed(2)}%</span></div>
                  <div className="flex justify-between border-t pt-1"><span className="text-slate-600 font-medium">AOQL:</span><span className="font-bold text-indigo-700">{(mathOptions.opt3Double.aoql * 100).toFixed(2)}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-600 font-medium">ATI (at AQL):</span><span className="font-bold text-teal-700">{Math.round(mathOptions.opt3Double.ati)}</span></div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* OC CURVE VISUALIZATION SECTION */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4 mb-4 gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Operating Characteristic (OC) Curve Analysis</h2>
              <p className="text-xs text-slate-500">
                {customModeActive 
                  ? "Custom Mode: Showing OC Curves & Target Reference Points for Recommended Logic 1, 2, and 3 Plans" 
                  : "High-Resolution Dynamic Plot with Exact AQL & RQL Intersecting Reference Points"}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              {customModeActive ? (
                <>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-blue-600 inline-block rounded-full"></span> Logic 1</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-purple-600 inline-block rounded-full"></span> Logic 2</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-emerald-600 inline-block rounded-full"></span> Logic 3</span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-blue-600 inline-block rounded-full"></span> Lookup Single</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-500 inline-block rounded-full"></span> Double 1st Sample</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-amber-500 inline-block rounded-full"></span> Double Combined</span>
                </>
              )}
            </div>
          </div>

          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis 
                  dataKey="p" 
                  type="number"
                  domain={[0, 0.20]}
                  tickFormatter={(val) => `${(val * 100).toFixed(1)}%`}
                  label={{ value: 'Fraction Defective (p)', position: 'insideBottom', offset: -15, fill: '#64748b', fontSize: 12 }}
                  stroke="#94a3b8"
                />
                <YAxis 
                  domain={[0, 100]}
                  tickFormatter={(val) => `${val.toFixed(0)}%`}
                  label={{ value: 'Probability of Acceptance (Pa)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 12 }}
                  stroke="#94a3b8"
                />
                <Tooltip 
                  formatter={(val, name) => [`${val.toFixed(2)}%`, name]}
                  labelFormatter={(val) => `Defect Rate (p): ${(val * 100).toFixed(2)}%`}
                  contentStyle={{ backgroundColor: '#1e293b', color: '#fff', borderRadius: '8px', fontSize: '12px', border: 'none' }}
                />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
                
                {customModeActive ? (
                  <>
                    <Line type="monotone" dataKey="paOpt1Single" name="Logic 1 Single" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="paOpt1Double" name="Logic 1 Double" stroke="#1d4ed8" strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="paOpt2Single" name="Logic 2 Single" stroke="#ec4899" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="paOpt2Double" name="Logic 2 Double" stroke="#9333ea" strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="paOpt3Single" name="Logic 3 Single" stroke="#059669" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="paOpt3Double" name="Logic 3 Double" stroke="#047857" strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={{ r: 6 }} />

                    {/* Custom Mode Target Reference Dots */}
                    <ReferenceDot x={activeAQL} y={mathOptions.opt1Single.paAql * 100} r={5} fill="#10b981" stroke="#047857" strokeWidth={2} isFront={true} />
                    <ReferenceDot x={mathOptions.opt1Single.rql} y={calculatePa(lotSize, mathOptions.opt1Single.n, mathOptions.opt1Single.c, mathOptions.opt1Single.rql) * 100} r={5} fill="#7c3aed" stroke="#4c1d95" strokeWidth={2} isFront={true} />
                    <ReferenceDot x={activeAQL} y={mathOptions.opt2Double.paAql * 100} r={5} fill="#34d399" stroke="#065f46" strokeWidth={2} isFront={true} />
                    <ReferenceDot x={mathOptions.opt2Double.rql} y={calculateDoublePa(lotSize, mathOptions.opt2Double, mathOptions.opt2Double.rql) * 100} r={5} fill="#c084fc" stroke="#6b21a8" strokeWidth={2} isFront={true} />
                  </>
                ) : (
                  <>
                    <Line type="monotone" dataKey="paSingle" name="Lookup Single (Pa)" stroke="#2563eb" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="paDoubleFirst" name="Double First Sample (Pa1)" stroke="#ef4444" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="paDoubleComb" name="Double Combined (Pa)" stroke="#f59e0b" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />

                    <ReferenceDot x={singleAqlMarker.x} y={singleAqlMarker.y} r={6} fill="#10b981" stroke="#047857" strokeWidth={2} isFront={true} />
                    <ReferenceDot x={singleRqlMarker.x} y={singleRqlMarker.y} r={6} fill="#7c3aed" stroke="#4c1d95" strokeWidth={2} isFront={true} />
                    <ReferenceDot x={doubleCombAqlMarker.x} y={doubleCombAqlMarker.y} r={6} fill="#34d399" stroke="#065f46" strokeWidth={2} isFront={true} />
                    <ReferenceDot x={doubleCombRqlMarker.x} y={doubleCombRqlMarker.y} r={6} fill="#c084fc" stroke="#6b21a8" strokeWidth={2} isFront={true} />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AOQ CURVE VISUALIZATION SECTION */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4 mb-4 gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Average Outgoing Quality (AOQ) Curves</h2>
              <p className="text-xs text-slate-500">
                Model: <span className="font-semibold text-slate-700">{lookupSingle.n / lotSize > 0.1 ? "Hypergeometric (n/N > 10%)" : "Poisson (n/N ≤ 10%)"}</span> — Peak markers indicate exact AOQL (Maximum Outgoing Quality)
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              {customModeActive ? (
                <>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-blue-600 inline-block rounded-full"></span> Logic 1 AOQ</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-pink-600 inline-block rounded-full"></span> Logic 2 Single AOQ</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-purple-600 inline-block rounded-full"></span> Logic 2 Double AOQ</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-emerald-600 inline-block rounded-full"></span> Logic 3 AOQ</span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-blue-600 inline-block rounded-full"></span> Single Plan AOQ</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-amber-500 inline-block rounded-full"></span> Double Plan AOQ</span>
                </>
              )}
            </div>
          </div>

          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis 
                  dataKey="p" 
                  type="number"
                  domain={[0, 0.20]}
                  tickFormatter={(val) => `${(val * 100).toFixed(1)}%`}
                  label={{ value: 'Incoming Fraction Defective (p)', position: 'insideBottom', offset: -15, fill: '#64748b', fontSize: 12 }}
                  stroke="#94a3b8"
                />
                <YAxis 
                  tickFormatter={(val) => `${val.toFixed(2)}%`}
                  label={{ value: 'Outgoing Quality (AOQ %)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 12 }}
                  stroke="#94a3b8"
                />
                <Tooltip 
                  formatter={(val, name) => [`${val.toFixed(3)}%`, name]}
                  labelFormatter={(val) => `Defect Rate (p): ${(val * 100).toFixed(2)}%`}
                  contentStyle={{ backgroundColor: '#1e293b', color: '#fff', borderRadius: '8px', fontSize: '12px', border: 'none' }}
                />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
                
                {customModeActive ? (
                  <>
                    <Line type="monotone" dataKey="aoqOpt1Single" name="Logic 1 Single AOQ" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="aoqOpt1Double" name="Logic 1 Double AOQ" stroke="#1d4ed8" strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="aoqOpt2Single" name="Logic 2 Single AOQ" stroke="#ec4899" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="aoqOpt2Double" name="Logic 2 Double AOQ" stroke="#9333ea" strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="aoqOpt3Single" name="Logic 3 Single AOQ" stroke="#059669" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="aoqOpt3Double" name="Logic 3 Double AOQ" stroke="#047857" strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={{ r: 6 }} />

                    {/* Custom Mode Peak AOQL Markers */}
                    <ReferenceDot x={opt1AoqlPeakMarker.p} y={opt1AoqlPeakMarker.aoq} r={5} fill="#2563eb" stroke="#1d4ed8" strokeWidth={2} isFront={true} label={{ value: `L1 AOQL: ${opt1AoqlPeakMarker.aoq.toFixed(2)}%`, position: 'top', fill: '#1d4ed8', fontSize: 10, fontWeight: 'bold' }} />
                    <ReferenceDot x={opt2SingleAoqlPeakMarker.p} y={opt2SingleAoqlPeakMarker.aoq} r={5} fill="#ec4899" stroke="#be185d" strokeWidth={2} isFront={true} label={{ value: `L2 AOQL: ${opt2SingleAoqlPeakMarker.aoq.toFixed(2)}%`, position: 'top', fill: '#be185d', fontSize: 10, fontWeight: 'bold' }} />
                    <ReferenceDot x={opt3AoqlPeakMarker.p} y={opt3AoqlPeakMarker.aoq} r={5} fill="#059669" stroke="#047857" strokeWidth={2} isFront={true} label={{ value: `L3 AOQL: ${opt3AoqlPeakMarker.aoq.toFixed(2)}%`, position: 'bottom', fill: '#047857', fontSize: 10, fontWeight: 'bold' }} />
                  </>
                ) : (
                  <>
                    <Line type="monotone" dataKey="aoqSingle" name="Lookup Single AOQ (%)" stroke="#2563eb" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="aoqDouble" name="Lookup Double AOQ (%)" stroke="#f59e0b" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />

                    <ReferenceDot x={singleAoqlPeakMarker.p} y={singleAoqlPeakMarker.aoq} r={6} fill="#2563eb" stroke="#1d4ed8" strokeWidth={2} isFront={true} label={{ value: `Single AOQL: ${singleAoqlPeakMarker.aoq.toFixed(2)}%`, position: 'top', fill: '#1d4ed8', fontSize: 11, fontWeight: 'bold' }} />
                    <ReferenceDot x={doubleAoqlPeakMarker.p} y={doubleAoqlPeakMarker.aoq} r={6} fill="#f59e0b" stroke="#b45309" strokeWidth={2} isFront={true} label={{ value: `Double AOQL: ${doubleAoqlPeakMarker.aoq.toFixed(2)}%`, position: 'bottom', fill: '#b45309', fontSize: 11, fontWeight: 'bold' }} />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CUSTOM PLAN GENERATOR MODAL */}
        {showModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-6">
              <div className="flex justify-between items-center border-b pb-4">
                <h3 className="text-lg font-bold text-slate-900">Custom Plan Generator</h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
              </div>

              <p className="text-sm text-slate-600">
                Configure your custom target AQL and RQL parameters below. Clicking confirm will switch the calculator to Custom Mode and update all mathematical models.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Custom Target AQL (%)</label>
                  <input 
                    type="number" 
                    step="0.05" 
                    value={customAQLInput} 
                    onChange={(e) => setCustomAQLInput(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    placeholder="e.g. 1.5"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Custom Target RQL (%) — Optional</label>
                  <input 
                    type="number" 
                    step="0.5" 
                    value={customRQLInput} 
                    onChange={(e) => setCustomRQLInput(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    placeholder="Leave empty to inherit from Logic 1"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">If left blank, Logic 2 automatically inherits its RQL target from Logic 1.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Logic 3 Custom Sample Size (n) — Optional</label>
                  <input 
                    type="number" 
                    min="1"
                    value={customLogic3NInput} 
                    onChange={(e) => setCustomLogic3NInput(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    placeholder="Leave empty for dynamic solved baseline"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">If specified, Logic 3 uses your fixed n to solve c, Pa, AOQL, and ATI.</p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    setCustomModeActive(true);
                    setShowModal(false);
                  }}
                  className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold shadow-md transition-colors"
                >
                  Confirm & Use Custom
                </button>
              </div>

            </div>
          </div>
        )}

        {/* DONATE & CONTACT POPUP MODAL */}
        {showDonateModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 text-center relative overflow-hidden max-h-[90vh] overflow-y-auto">
              <button 
                onClick={() => setShowDonateModal(false)} 
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold text-lg w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
              >
                ✕
              </button>

              <div className="space-y-1">
                <span className="text-2xl">☕</span>
                <h3 className="text-xl font-bold text-slate-900">Support & Contact</h3>
                <p className="text-xs text-slate-500">Thank you for supporting the development of this calculator!</p>
              </div>

              {/* VietQR Bank Card Container */}
              <div className="bg-gradient-to-b from-slate-50 to-emerald-50/40 p-4 rounded-xl border border-emerald-100 shadow-sm space-y-3">
                <div className="flex items-center justify-between px-2">
                  <span className="text-xs font-black text-teal-800 tracking-wider">BIDV</span>
                  <span className="text-xs font-bold text-red-600 tracking-wider">VietQR™</span>
                </div>

                {/* Dynamic VietQR Barcode Image (QR Only - No Bottom Text) */}
                <div className="flex justify-center py-1">
                  <img 
                    src="https://img.vietqr.io/image/BIDV-3680448318-qr_only.png?accountName=KIEU%20NHAT%20MINH" 
                    alt="VietQR Bank Barcode - KIEU NHAT MINH" 
                    className="w-56 h-auto rounded-lg shadow-sm border border-white"
                  />
                </div>

                <div className="space-y-0.5 text-center">
                  <h4 className="text-base font-extrabold text-teal-950 tracking-wide uppercase">KIEU NHAT MINH</h4>
                  <p className="text-lg font-black text-emerald-700 tracking-widest">3680448318</p>
                  <p className="text-[11px] text-slate-600 font-medium leading-tight">Bank for Investment and Development of Vietnam (BIDV)</p>
                </div>
              </div>

              {/* Contact Links */}
              <div className="space-y-2.5 pt-1 text-left text-xs">
                <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-base">📧</span>
                  <div className="overflow-hidden">
                    <span className="block font-bold text-slate-700 uppercase text-[10px]">Email</span>
                    <a href="mailto:kieunhatminh@gmail.com" className="text-blue-600 hover:underline font-semibold truncate block">
                      kieunhatminh@gmail.com
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-base">🌐</span>
                  <div className="overflow-hidden">
                    <span className="block font-bold text-slate-700 uppercase text-[10px]">Website</span>
                    <a 
                      href="https://sites.google.com/view/kieuminh?usp=sharing" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-blue-600 hover:underline font-semibold truncate block"
                    >
                      https://sites.google.com/view/kieuminh?usp=sharing
                    </a>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setShowDonateModal(false)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold shadow transition-colors"
              >
                Close Window
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}