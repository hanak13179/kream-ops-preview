// Sheet values are fallbacks only. Manager rules and actual stock remain authoritative.
export function withSheetRule(rule,entry,count){
 if(!entry)return rule;
 if(rule?.weekday_base!=null||rule?.weekend_base!=null)return rule;
 if(count?.minimum!=null)return {...rule,weekday_base:Number(count.minimum),weekend_base:null,weekend_days:rule?.weekend_days||[5,6,0]};
 if(!entry||entry.match_status!=='ready'||entry.order_quantity==null)return rule;
 return {...rule,weekday_base:Number(entry.order_quantity),weekend_base:null,weekend_days:rule?.weekend_days||[5,6,0],sheet_fallback:true};
}
export function sheetRecommendationLabel(entry,t){
 if(!entry)return '';
 return t('시트 추천','Sheet suggestion')+': '+entry.source_quantity+' '+entry.source_unit+(entry.match_status==='unit_pending'?t(' · 발주단위 환산 필요',' · order-unit conversion pending'):'');
}
