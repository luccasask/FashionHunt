const formatter = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'});
export const discoveryDay = (now = new Date()) => formatter.format(new Date(now));
export function discoveryClock(now = new Date()) {
  const day=discoveryDay(now);
  let low=new Date(now).getTime(),high=low+27*3600000;
  while(high-low>1){const mid=Math.floor((low+high)/2);if(discoveryDay(mid)===day)low=mid;else high=mid;}
  return {day,timeZone:'Europe/Stockholm',nextResetAt:new Date(high).toISOString()};
}
