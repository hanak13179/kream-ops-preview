const compact = value => String(value ?? '').toLowerCase().replace(/[\s·%()_-]+/g, '');

export function isRequiredOrderItem(product) {
  if (!product.unit_confirmed || product.category === '키친 발주') return false;
  const ko = compact(product.name_ko);
  const en = compact(product.name_en);
  const group = compact(product.subgroup);
  const dubai = /두바이쫀득|두쫀쿠/.test(ko) || /dubai.*(?:chewy|cookie)/.test(en);
  if (dubai) return !/말차|녹차|쑥|matcha|greentea|mugwort/.test(ko + en) &&
    (/초코|초콜릿|오리지널|choc|original/.test(ko + en) || /^(두바이쫀득쿠키|두쫀쿠)$/.test(ko));
  return /^(우유(?:2)?|스패너크림|아몬드밀크|오트밀크|화채캔|리얼망고프루티캔|미숫가루캔)$/.test(ko) ||
    /^(?:2milk|milk2|spannere?cream|almondmilk|oatmilk|hwachaecan|realmangofruitycan|misugarucan)$/.test(en) ||
    /레어치즈케(이크|익)|치아[씨시]드|미니크로[와아]상|크로[와아]상미니|홀케(이크|익)/.test(ko + group) ||
    /rarecheesecake|chiaseed|minicroissant|wholecake/.test(en) ||
    (!/크림밤|치즈케(이크|익)|베이스|크림|음료제조용|kreambomb|cheesecake|base|cream/.test(ko + en) &&
      /티라미수|tiramisu/.test(ko + en + group));
}

export function isSupplyOrderItem(product) {
  return /포장|소모품/.test(String(product.category ?? "") + String(product.subgroup ?? ""));
}
