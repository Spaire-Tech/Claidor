import XCTest
@testable import SimeonCore

/**
 * Routines' schedules and events against the shipped window's own
 * functions: the expected values below were made by running the bundle's
 * `pmt`, `dgn`, `sTe`, `fae`, `mne`, `rTe`, `h2n`, `pgn`, `Vgn`, `Wgn`,
 * `tQ` and the rows' words in Node (`routine-fixtures.mjs` in the work
 * notes), on these inputs.
 */
final class RoutineTriggerTests: XCTestCase {
  static let fixtures = #"""
{"schedules":[{"s":"0 * * * *","valid":true,"words":"Every hour","shape":{"mode":"hourly","minute":0},"line":"0 * * * *","weekly":"0 8 * * 1","advanced":"0 * * * *","interval":"@every 30m","lead":"Every","rest":"hour"},{"s":"30 * * * *","valid":true,"words":"Every hour at :30","shape":{"mode":"hourly","minute":30},"line":"30 * * * *","weekly":"30 8 * * 1","advanced":"30 8 * * *","interval":"@every 30m","lead":"Every","rest":"hour at :30"},{"s":"0 8 * * *","valid":true,"words":"Every day at 8:00 AM","shape":{"mode":"daily","time":{"hour":8,"minute":0}},"line":"0 8 * * *","weekly":"0 8 * * 1","advanced":"0 8 * * *","interval":"@every 30m","lead":"Every","rest":"day at 8:00 AM"},{"s":"15 14 * * *","valid":true,"words":"Every day at 2:15 PM","shape":{"mode":"daily","time":{"hour":14,"minute":15}},"line":"15 14 * * *","weekly":"15 14 * * 1","advanced":"15 14 * * *","interval":"@every 30m","lead":"Every","rest":"day at 2:15 PM"},{"s":"0 8 * * 1-5","valid":true,"words":"Weekdays at 8:00 AM","shape":{"mode":"weekdays","time":{"hour":8,"minute":0}},"line":"0 8 * * 1-5","weekly":"0 8 * * 1","advanced":"0 8 * * 1,2,3,4,5","interval":"@every 30m","lead":"On","rest":"weekdays at 8:00 AM"},{"s":"0 8 * * 1","valid":true,"words":"Every Monday at 8:00 AM","shape":{"mode":"weekly","dayOfWeek":1,"time":{"hour":8,"minute":0}},"line":"0 8 * * 1","weekly":"0 8 * * 1","advanced":"0 8 * * 1","interval":"@every 30m","lead":"Every","rest":"Monday at 8:00 AM"},{"s":"0 9 * * 0","valid":true,"words":"Every Sunday at 9:00 AM","shape":{"mode":"weekly","dayOfWeek":0,"time":{"hour":9,"minute":0}},"line":"0 9 * * 0","weekly":"0 9 * * 0","advanced":"0 9 * * 0","interval":"@every 30m","lead":"Every","rest":"Sunday at 9:00 AM"},{"s":"0 8 1 * *","valid":true,"words":"On the 1st of every month at 8:00 AM","shape":{"mode":"monthly","dayOfMonth":1,"time":{"hour":8,"minute":0}},"line":"0 8 1 * *","weekly":"0 8 * * 1","advanced":"0 8 1 * *","interval":"@every 30m","lead":"Monthly","rest":"on the 1st at 8:00 AM"},{"s":"0 8 15 * *","valid":true,"words":"On the 15th of every month at 8:00 AM","shape":{"mode":"monthly","dayOfMonth":15,"time":{"hour":8,"minute":0}},"line":"0 8 15 * *","weekly":"0 8 * * 1","advanced":"0 8 15 * *","interval":"@every 30m","lead":"Monthly","rest":"on the 15th at 8:00 AM"},{"s":"@every 30m","valid":true,"words":"Every 30 minutes","shape":{"mode":"interval","amount":30,"unit":"minutes"},"line":"@every 30m","weekly":"0 8 * * 1","advanced":"*/30 * * * *","interval":"@every 30m","lead":"Every","rest":"30 minutes"},{"s":"@every 1h","valid":true,"words":"Every hour","shape":{"mode":"interval","amount":1,"unit":"hours"},"line":"@every 1h","weekly":"0 8 * * 1","advanced":"0 * * * *","interval":"@every 1h","lead":"Every","rest":"hour"},{"s":"@every 2d","valid":true,"words":"Every 2 days","shape":{"mode":"interval","amount":2,"unit":"days"},"line":"@every 2d","weekly":"0 8 * * 1","advanced":"0 8 * * *","interval":"@every 2d","lead":"Every","rest":"2 days"},{"s":"@every 45s","valid":true,"words":"Every 45 seconds","shape":null,"line":null,"weekly":"0 8 * * 1","advanced":"0 8 * * *","interval":"@every 30m","lead":"Every","rest":"45 seconds"},{"s":"*/15 9-17 * * 1-5","valid":true,"words":"Every 15 minutes on weekdays, 9:00 AM – 5:45 PM","shape":{"mode":"advanced","months":null,"days":{"kind":"days-of-week","daysOfWeek":[1,2,3,4,5]},"time":{"kind":"interval","unit":"minutes","amount":15,"fromHour":9,"toHour":17}},"line":"*/15 9-17 * * 1,2,3,4,5","weekly":"0 8 * * 1","advanced":"*/15 9-17 * * 1,2,3,4,5","interval":"@every 30m","lead":"Every","rest":"15 minutes on weekdays, 9:00 AM – 5:45 PM"},{"s":"*/15 * * * *","valid":true,"words":"Every 15 minutes","shape":{"mode":"advanced","months":null,"days":{"kind":"every-day"},"time":{"kind":"interval","unit":"minutes","amount":15,"fromHour":0,"toHour":23}},"line":"*/15 * * * *","weekly":"0 8 * * 1","advanced":"*/15 * * * *","interval":"@every 30m","lead":"Every","rest":"15 minutes"},{"s":"0 */2 * * *","valid":true,"words":"Every 2 hours","shape":{"mode":"advanced","months":null,"days":{"kind":"every-day"},"time":{"kind":"interval","unit":"hours","amount":2,"fromHour":0,"toHour":23}},"line":"0 */2 * * *","weekly":"0 8 * * 1","advanced":"0 */2 * * *","interval":"@every 30m","lead":"Every","rest":"2 hours"},{"s":"0 9,13,17 * * *","valid":true,"words":"Every day at 9:00 AM, 1:00 PM, and 5:00 PM","shape":{"mode":"advanced","months":null,"days":{"kind":"every-day"},"time":{"kind":"interval","unit":"hours","amount":4,"fromHour":9,"toHour":17}},"line":"0 9-17/4 * * *","weekly":"0 8 * * 1","advanced":"0 9-17/4 * * *","interval":"@every 30m","lead":"Every","rest":"day at 9:00 AM, 1:00 PM, and 5:00 PM"},{"s":"0 9 * * 6,0","valid":true,"words":"Weekends at 9:00 AM","shape":{"mode":"advanced","months":null,"days":{"kind":"days-of-week","daysOfWeek":[0,6]},"time":{"kind":"at-times","minute":0,"hours":[9]}},"line":"0 9 * * 0,6","weekly":"0 9 * * 1","advanced":"0 9 * * 0,6","interval":"@every 30m","lead":"Weekends","rest":"at 9:00 AM"},{"s":"0 9 * * 1,3,5","valid":true,"words":"Every Monday, Wednesday, and Friday at 9:00 AM","shape":{"mode":"advanced","months":null,"days":{"kind":"days-of-week","daysOfWeek":[1,3,5]},"time":{"kind":"at-times","minute":0,"hours":[9]}},"line":"0 9 * * 1,3,5","weekly":"0 9 * * 1","advanced":"0 9 * * 1,3,5","interval":"@every 30m","lead":"Every","rest":"Monday, Wednesday, and Friday at 9:00 AM"},{"s":"0 9 * * 1-6","valid":true,"words":"Mon–Sat at 9:00 AM","shape":{"mode":"advanced","months":null,"days":{"kind":"days-of-week","daysOfWeek":[1,2,3,4,5,6]},"time":{"kind":"at-times","minute":0,"hours":[9]}},"line":"0 9 * * 1,2,3,4,5,6","weekly":"0 9 * * 1","advanced":"0 9 * * 1,2,3,4,5,6","interval":"@every 30m","lead":"Mon–Sat","rest":"at 9:00 AM"},{"s":"30 9 1,15 * *","valid":true,"words":"On the 1st and 15th of every month at 9:30 AM","shape":{"mode":"advanced","months":null,"days":{"kind":"days-of-month","daysOfMonth":[1,15]},"time":{"kind":"at-times","minute":30,"hours":[9]}},"line":"30 9 1,15 * *","weekly":"30 9 * * 1","advanced":"30 9 1,15 * *","interval":"@every 30m","lead":"On","rest":"the 1st and 15th of every month at 9:30 AM"},{"s":"0 9 25 12 *","valid":true,"words":"Every December 25 at 9:00 AM","shape":{"mode":"advanced","months":[12],"days":{"kind":"days-of-month","daysOfMonth":[25]},"time":{"kind":"at-times","minute":0,"hours":[9]}},"line":"0 9 25 12 *","weekly":"0 9 * * 1","advanced":"0 9 25 12 *","interval":"@every 30m","lead":"Every","rest":"December 25 at 9:00 AM"},{"s":"0 9 * 1,7 *","valid":true,"words":"0 9 * 1,7 *","shape":{"mode":"advanced","months":[1,7],"days":{"kind":"every-day"},"time":{"kind":"at-times","minute":0,"hours":[9]}},"line":"0 9 * 1,7 *","weekly":"0 9 * * 1","advanced":"0 9 * 1,7 *","interval":"@every 30m","lead":"Cron","rest":"0 9 * 1,7 *"},{"s":"CRON_TZ=America/New_York 0 9 * * *","valid":true,"words":"Every day at 9:00 AM (America/New_York)","shape":null,"line":null,"weekly":"0 8 * * 1","advanced":"0 8 * * *","interval":"@every 30m","lead":"Every","rest":"day at 9:00 AM (America/New_York)"},{"s":"TZ=Bad/Zone 0 9 * * *","valid":false,"words":"TZ=Bad/Zone 0 9 * * *","shape":null,"line":null,"weekly":"0 8 * * 1","advanced":"0 8 * * *","interval":"@every 30m","lead":"Cron","rest":"TZ=Bad/Zone 0 9 * * *"},{"s":"@daily","valid":true,"words":"Every day at 12:00 AM","shape":{"mode":"daily","time":{"hour":0,"minute":0}},"line":"0 0 * * *","weekly":"0 0 * * 1","advanced":"0 0 * * *","interval":"@every 30m","lead":"Every","rest":"day at 12:00 AM"},{"s":"@weekly","valid":true,"words":"Every Sunday at 12:00 AM","shape":{"mode":"weekly","dayOfWeek":0,"time":{"hour":0,"minute":0}},"line":"0 0 * * 0","weekly":"0 0 * * 0","advanced":"0 0 * * 0","interval":"@every 30m","lead":"Every","rest":"Sunday at 12:00 AM"},{"s":"* * * * *","valid":true,"words":"Every minute","shape":{"mode":"advanced","months":null,"days":{"kind":"every-day"},"time":{"kind":"interval","unit":"minutes","amount":1,"fromHour":0,"toHour":23}},"line":"* * * * *","weekly":"0 8 * * 1","advanced":"* * * * *","interval":"@every 30m","lead":"Every","rest":"minute"},{"s":"0 9-17 * * *","valid":true,"words":"Every hour, 9:00 AM – 5:00 PM","shape":{"mode":"advanced","months":null,"days":{"kind":"every-day"},"time":{"kind":"at-times","minute":0,"hours":[9,10,11,12,13,14,15,16,17]}},"line":"0 9,10,11,12,13,14,15,16,17 * * *","weekly":"0 9 * * 1","advanced":"0 9,10,11,12,13,14,15,16,17 * * *","interval":"@every 30m","lead":"Every","rest":"hour, 9:00 AM – 5:00 PM"},{"s":"5,35 * * * *","valid":true,"words":"Every hour at :05 and :35","shape":null,"line":null,"weekly":"0 8 * * 1","advanced":"0 8 * * *","interval":"@every 30m","lead":"Every","rest":"hour at :05 and :35"},{"s":"0,20,40 9 * * *","valid":true,"words":"Every 20 minutes, 9:00 AM – 9:40 AM","shape":{"mode":"advanced","months":null,"days":{"kind":"every-day"},"time":{"kind":"interval","unit":"minutes","amount":20,"fromHour":9,"toHour":9}},"line":"*/20 9-9 * * *","weekly":"0 8 * * 1","advanced":"*/20 9-9 * * *","interval":"@every 30m","lead":"Every","rest":"20 minutes, 9:00 AM – 9:40 AM"},{"s":"0 9 1 * 1","valid":true,"words":"0 9 1 * 1","shape":null,"line":null,"weekly":"0 8 * * 1","advanced":"0 8 * * *","interval":"@every 30m","lead":"Cron","rest":"0 9 1 * 1"},{"s":"bogus","valid":false,"words":"bogus","shape":null,"line":null,"weekly":"0 8 * * 1","advanced":"0 8 * * *","interval":"@every 30m","lead":"Cron","rest":"bogus"},{"s":"0 9 * * MON","valid":false,"words":"0 9 * * MON","shape":null,"line":null,"weekly":"0 8 * * 1","advanced":"0 8 * * *","interval":"@every 30m","lead":"Cron","rest":"0 9 * * MON"},{"s":"0 24 * * *","valid":false,"words":"0 24 * * *","shape":null,"line":null,"weekly":"0 8 * * 1","advanced":"0 8 * * *","interval":"@every 30m","lead":"Cron","rest":"0 24 * * *"},{"s":"","valid":false,"words":"","shape":null,"line":null,"weekly":"0 8 * * 1","advanced":"0 8 * * *","interval":"@every 30m","lead":"Cron","rest":"…"},{"s":" 0  8 * * * ","valid":true,"words":"Every day at 8:00 AM","shape":{"mode":"daily","time":{"hour":8,"minute":0}},"line":"0 8 * * *","weekly":"0 8 * * 1","advanced":"0 8 * * *","interval":"@every 30m","lead":"Every","rest":"day at 8:00 AM"},{"s":"0 0 * * 7","valid":true,"words":"Every Sunday at 12:00 AM","shape":{"mode":"weekly","dayOfWeek":0,"time":{"hour":0,"minute":0}},"line":"0 0 * * 0","weekly":"0 0 * * 0","advanced":"0 0 * * 0","interval":"@every 30m","lead":"Every","rest":"Sunday at 12:00 AM"},{"s":"10 8-20/4 * * *","valid":true,"words":"Every 4 hours, 8:10 AM – 8:10 PM","shape":{"mode":"advanced","months":null,"days":{"kind":"every-day"},"time":{"kind":"at-times","minute":10,"hours":[8,12,16,20]}},"line":"10 8,12,16,20 * * *","weekly":"10 8 * * 1","advanced":"10 8,12,16,20 * * *","interval":"@every 30m","lead":"Every","rest":"4 hours, 8:10 AM – 8:10 PM"},{"s":"0 6-18/3 * * 1-5","valid":true,"words":"Every 3 hours on weekdays, 6:00 AM – 6:00 PM","shape":{"mode":"advanced","months":null,"days":{"kind":"days-of-week","daysOfWeek":[1,2,3,4,5]},"time":{"kind":"interval","unit":"hours","amount":3,"fromHour":6,"toHour":18}},"line":"0 6-18/3 * * 1,2,3,4,5","weekly":"0 8 * * 1","advanced":"0 6-18/3 * * 1,2,3,4,5","interval":"@every 30m","lead":"Every","rest":"3 hours on weekdays, 6:00 AM – 6:00 PM"},{"s":"0 9 * * 2-4","valid":true,"words":"Every Tuesday, Wednesday, and Thursday at 9:00 AM","shape":{"mode":"advanced","months":null,"days":{"kind":"days-of-week","daysOfWeek":[2,3,4]},"time":{"kind":"at-times","minute":0,"hours":[9]}},"line":"0 9 * * 2,3,4","weekly":"0 9 * * 1","advanced":"0 9 * * 2,3,4","interval":"@every 30m","lead":"Every","rest":"Tuesday, Wednesday, and Thursday at 9:00 AM"},{"s":"0 9 * * 1,2,3,4","valid":true,"words":"Mon–Thu at 9:00 AM","shape":{"mode":"advanced","months":null,"days":{"kind":"days-of-week","daysOfWeek":[1,2,3,4]},"time":{"kind":"at-times","minute":0,"hours":[9]}},"line":"0 9 * * 1,2,3,4","weekly":"0 9 * * 1","advanced":"0 9 * * 1,2,3,4","interval":"@every 30m","lead":"Mon–Thu","rest":"at 9:00 AM"},{"s":"0 */3 * * *","valid":true,"words":"Every 3 hours","shape":{"mode":"advanced","months":null,"days":{"kind":"every-day"},"time":{"kind":"interval","unit":"hours","amount":3,"fromHour":0,"toHour":23}},"line":"0 */3 * * *","weekly":"0 8 * * 1","advanced":"0 */3 * * *","interval":"@every 30m","lead":"Every","rest":"3 hours"},{"s":"0 0 * * *","valid":true,"words":"Every day at 12:00 AM","shape":{"mode":"daily","time":{"hour":0,"minute":0}},"line":"0 0 * * *","weekly":"0 0 * * 1","advanced":"0 0 * * *","interval":"@every 30m","lead":"Every","rest":"day at 12:00 AM"},{"s":"*/5 8-9 * * *","valid":true,"words":"Every 5 minutes, 8:00 AM – 9:55 AM","shape":{"mode":"advanced","months":null,"days":{"kind":"every-day"},"time":{"kind":"interval","unit":"minutes","amount":5,"fromHour":8,"toHour":9}},"line":"*/5 8-9 * * *","weekly":"0 8 * * 1","advanced":"*/5 8-9 * * *","interval":"@every 30m","lead":"Every","rest":"5 minutes, 8:00 AM – 9:55 AM"}],"times":[{"zone":"UTC","ms":1791557970000,"words":"just now"},{"zone":"UTC","ms":1791557700000,"words":"5 min ago"},{"zone":"UTC","ms":1791554460000,"words":"59 min ago"},{"zone":"UTC","ms":1791547200000,"words":"today at 12:00 PM"},{"zone":"UTC","ms":1791486000000,"words":"yesterday at 7:00 PM"},{"zone":"UTC","ms":1791464400000,"words":"yesterday at 1:00 PM"},{"zone":"UTC","ms":1791298800000,"words":"last Tuesday at 3:00 PM"},{"zone":"UTC","ms":1791039600000,"words":"last Saturday at 3:00 PM"},{"zone":"UTC","ms":1790866800000,"words":"Oct 1 at 3:00 PM"},{"zone":"UTC","ms":1756998000000,"words":"Sep 4, 2025 at 3:00 PM"},{"zone":"UTC","ms":1791558600000,"words":"in 10 min"},{"zone":"UTC","ms":1791666000000,"words":"tomorrow at 9:00 PM"},{"zone":"UTC","ms":1791817200000,"words":"Monday at 3:00 PM"},{"zone":"America/Los_Angeles","ms":1791557970000,"words":"just now"},{"zone":"America/Los_Angeles","ms":1791557700000,"words":"5 min ago"},{"zone":"America/Los_Angeles","ms":1791554460000,"words":"59 min ago"},{"zone":"America/Los_Angeles","ms":1791547200000,"words":"today at 5:00 AM"},{"zone":"America/Los_Angeles","ms":1791486000000,"words":"yesterday at 12:00 PM"},{"zone":"America/Los_Angeles","ms":1791464400000,"words":"yesterday at 6:00 AM"},{"zone":"America/Los_Angeles","ms":1791298800000,"words":"last Tuesday at 8:00 AM"},{"zone":"America/Los_Angeles","ms":1791039600000,"words":"last Saturday at 8:00 AM"},{"zone":"America/Los_Angeles","ms":1790866800000,"words":"Oct 1 at 8:00 AM"},{"zone":"America/Los_Angeles","ms":1756998000000,"words":"Sep 4, 2025 at 8:00 AM"},{"zone":"America/Los_Angeles","ms":1791558600000,"words":"in 10 min"},{"zone":"America/Los_Angeles","ms":1791666000000,"words":"tomorrow at 2:00 PM"},{"zone":"America/Los_Angeles","ms":1791817200000,"words":"Monday at 8:00 AM"},{"zone":"Asia/Tokyo","ms":1791557970000,"words":"just now"},{"zone":"Asia/Tokyo","ms":1791557700000,"words":"5 min ago"},{"zone":"Asia/Tokyo","ms":1791554460000,"words":"59 min ago"},{"zone":"Asia/Tokyo","ms":1791547200000,"words":"yesterday at 9:00 PM"},{"zone":"Asia/Tokyo","ms":1791486000000,"words":"yesterday at 4:00 AM"},{"zone":"Asia/Tokyo","ms":1791464400000,"words":"last Thursday at 10:00 PM"},{"zone":"Asia/Tokyo","ms":1791298800000,"words":"last Wednesday at 12:00 AM"},{"zone":"Asia/Tokyo","ms":1791039600000,"words":"last Sunday at 12:00 AM"},{"zone":"Asia/Tokyo","ms":1790866800000,"words":"Oct 2 at 12:00 AM"},{"zone":"Asia/Tokyo","ms":1756998000000,"words":"Sep 5, 2025 at 12:00 AM"},{"zone":"Asia/Tokyo","ms":1791558600000,"words":"in 10 min"},{"zone":"Asia/Tokyo","ms":1791666000000,"words":"tomorrow at 6:00 AM"},{"zone":"Asia/Tokyo","ms":1791817200000,"words":"Tuesday at 12:00 AM"}],"rows":[{"member":{"type":"cron","schedule":"0 8 * * 1-5"},"back":{"type":"cron","schedule":"0 8 * * 1-5"},"lead":"On","rest":"weekdays at 8:00 AM"},{"member":{"type":"slack","channel":"#launch","match":{"kind":"message"}},"back":{"type":"slack","channel":"#launch","match":{"kind":"message"}},"lead":"New","rest":"messages in #launch"},{"member":{"type":"slack","channel":"#launch","match":{"kind":"keyword","keyword":"deploy"}},"back":{"type":"slack","channel":"#launch","match":{"kind":"keyword","keyword":"deploy"}},"lead":"New","rest":"messages containing \"deploy\" in #launch"},{"member":{"type":"slack","channel":"*","match":{"kind":"mention"}},"back":{"type":"slack","channel":"*","match":{"kind":"mention"}},"lead":"When","rest":"@mentioned anywhere on Slack"},{"member":{"type":"slack","channel":"#ops","match":{"kind":"reaction","emoji":["eyes","+1"],"bySelf":true}},"back":{"type":"slack","channel":"#ops","match":{"kind":"reaction","emoji":["eyes","+1"],"bySelf":true}},"lead":"Reaction","rest":":eyes: or :+1: added by me in #ops"},{"member":{"type":"slack","channel":"#ops","match":{"kind":"reaction"}},"back":{"type":"slack","channel":"#ops","match":{"kind":"reaction"}},"lead":"Reaction","rest":"added in #ops"},{"member":{"type":"github","repo":"acme/app","events":["pr-opened","ci-failed"],"userAllowlist":["bass","Dana"],"ciBranch":"main"},"back":{"type":"github","repo":"acme/app","events":["pr-opened","ci-failed"],"userAllowlist":["bass","Dana"],"ciBranch":"main"},"lead":"When","rest":"a PR opens or CI fails on main in acme/app"},{"member":{"type":"github","repo":"acme/app","events":["review-requested"]},"back":{"type":"github","repo":"acme/app","events":["review-requested"]},"lead":"When","rest":"a review is requested in acme/app"},{"member":{"type":"microsoftTeams","tenantId":"t1","teamId":"","teamIds":["T1","T2"],"channelIds":["C1"],"messageContains":"help","messageContainsIsRegex":false,"blockUnauthenticatedTeamsUsers":true},"back":{"type":"microsoftTeams","tenantId":"t1","teamId":"","teamIds":["T1","T2"],"channelIds":["C1"],"messageContains":"help","messageContainsIsRegex":false,"blockUnauthenticatedTeamsUsers":true},"lead":"New","rest":"messages containing \"help\" in T1 or T2 (in C1)"},{"member":{"type":"linear","event":{"case":"statusChanged","statusIds":["s1"]},"projectIds":[],"teamIds":["ENG"]},"back":{"type":"linear","event":{"case":"statusChanged","statusIds":["s1"]},"projectIds":[],"teamIds":["ENG"]},"lead":"Issue","rest":"status → s1 in all projects for ENG"},{"member":{"type":"linear","event":{"case":"endOfCycle","cycleIds":[]},"projectIds":[],"teamIds":[]},"back":{"type":"linear","event":{"case":"endOfCycle","cycleIds":[]},"projectIds":[],"teamIds":[]},"lead":"At","rest":"end of cycle for all teams"},{"member":{"type":"linear","event":{"case":"issueCreated"},"projectIds":["P1","P2"],"teamIds":[]},"back":{"type":"linear","event":{"case":"issueCreated"},"projectIds":["P1","P2"],"teamIds":[]},"lead":"Issue","rest":"created in P1 or P2"},{"member":{"type":"sentry","event":{"case":"issueResolved"},"projectIds":[]},"back":{"type":"sentry","event":{"case":"issueResolved"},"projectIds":[]},"lead":"Issue","rest":"resolved in all projects"},{"member":{"type":"pagerduty","event":{"case":"incidentAny"},"serviceIds":["svc"]},"back":{"type":"pagerduty","event":{"case":"incidentAny"},"serviceIds":["svc"]},"lead":"Incident","rest":"any event on svc"}],"edits":[{"row":{"platform":"slack","channel":"  ","match":"message","keyword":"","emoji":"","bySelf":false},"member":null},{"row":{"platform":"slack","channel":"#a","match":"keyword","keyword":"  ","emoji":"","bySelf":false},"member":null},{"row":{"platform":"slack","channel":"#a","match":"reaction","keyword":"","emoji":":Eyes:, :+1::skin-tone-2: bad emoji! x y z w v u t s","bySelf":false},"member":{"type":"slack","channel":"#a","match":{"kind":"reaction","emoji":["eyes","+1","bad","x","y","z","w","v"]}}},{"row":{"platform":"github","repo":"acme","events":["pr-opened"],"userAllowlist":"","ciBranch":""},"member":null},{"row":{"platform":"github","repo":"acme/app","events":["ci-passed"],"userAllowlist":"@a, @A b","ciBranch":"feat/x"},"member":{"type":"github","repo":"acme/app","events":["ci-passed"],"userAllowlist":["a","b"],"ciBranch":"feat/x"}},{"row":{"platform":"github","repo":"acme/app","events":["ci-passed"],"userAllowlist":"","ciBranch":"bad branch"},"member":null},{"row":{"platform":"github","repo":"acme/app","events":[],"userAllowlist":"","ciBranch":""},"member":null},{"row":{"platform":"microsoftTeams","tenantId":"","teamIds":"T1","channelIds":"","messageContains":"","messageContainsIsRegex":false,"blockUnauthenticatedTeamsUsers":false},"member":null},{"row":{"platform":"schedule","schedule":"0 9 * * MON"},"member":null},{"row":{"platform":"schedule","schedule":" @every 15m "},"member":{"type":"cron","schedule":"@every 15m"}}],"group":{"type":"group","listeners":[{"type":"cron","schedule":"0 8 * * 1-5"},{"type":"slack","channel":"#launch","match":{"kind":"message"}}]}}
"""#

  lazy var data: JSON = try! JSON.parse(Self.fixtures)

  /** A shape as the window's objects write it, to compare with them. */
  func js(_ shape: RoutineSchedule.Shape?) -> JSON {
    guard let shape else { return .null }
    func time(_ t: RoutineSchedule.Time) -> JSON { ["hour": .number(Double(t.hour)), "minute": .number(Double(t.minute))] }
    func nums(_ list: [Int]) -> JSON { .array(list.map { .number(Double($0)) }) }
    switch shape {
    case .hourly(let m): return ["mode": "hourly", "minute": .number(Double(m))]
    case .daily(let t): return ["mode": "daily", "time": time(t)]
    case .weekdays(let t): return ["mode": "weekdays", "time": time(t)]
    case .weekly(let d, let t): return ["mode": "weekly", "dayOfWeek": .number(Double(d)), "time": time(t)]
    case .monthly(let d, let t): return ["mode": "monthly", "dayOfMonth": .number(Double(d)), "time": time(t)]
    case .interval(let a, let u): return ["mode": "interval", "amount": .number(Double(a)), "unit": .string(u)]
    case .advanced(let months, let days, let tod):
      let d: JSON
      switch days {
      case .everyDay: d = ["kind": "every-day"]
      case .daysOfWeek(let l): d = ["kind": "days-of-week", "daysOfWeek": nums(l)]
      case .daysOfMonth(let l): d = ["kind": "days-of-month", "daysOfMonth": nums(l)]
      }
      let t: JSON
      switch tod {
      case .atTimes(let m, let h): t = ["kind": "at-times", "minute": .number(Double(m)), "hours": nums(h)]
      case .interval(let u, let a, let f, let to): t = ["kind": "interval", "unit": .string(u), "amount": .number(Double(a)), "fromHour": .number(Double(f)), "toHour": .number(Double(to))]
      }
      return ["mode": "advanced", "months": months.map(nums) ?? .null, "days": d, "time": t]
    }
  }

  func testSchedulesAsTheWindowReadsWritesAndWordsThem() {
    XCTAssertEqual(data["schedules"]?.array?.count, 45)
    for item in data["schedules"]?.array ?? [] {
      let s = item["s"]?.string ?? ""
      XCTAssertEqual(RoutineSchedule.isValid(s), item["valid"]?.bool, "valid: \(s)")
      XCTAssertEqual(RoutineSchedule.describe(s), item["words"]?.string, "words: \(s)")
      let shape = RoutineSchedule.shape(s)
      XCTAssertEqual(js(shape), item["shape"], "shape: \(s)")
      if let shape { XCTAssertEqual(RoutineSchedule.line(shape), item["line"]?.string, "line: \(s)") }
      XCTAssertEqual(RoutineSchedule.line(RoutineSchedule.start("weekly", from: shape)), item["weekly"]?.string, "weekly from: \(s)")
      XCTAssertEqual(RoutineSchedule.line(RoutineSchedule.advanced(from: shape)), item["advanced"]?.string, "advanced from: \(s)")
      XCTAssertEqual(RoutineSchedule.line(RoutineSchedule.start("interval", from: shape)), item["interval"]?.string, "interval from: \(s)")
      let row = RoutineSchedule.row(s)
      XCTAssertEqual(row.lead, item["lead"]?.string, "lead: \(s)")
      XCTAssertEqual(row.rest, item["rest"]?.string, "rest: \(s)")
    }
  }

  func testWhenARunWas() {
    let now = 1_791_558_000_000.0
    XCTAssertEqual(data["times"]?.array?.count, 39)
    for item in data["times"]?.array ?? [] {
      let zone = TimeZone(identifier: item["zone"]?.string ?? "UTC")!
      let words = item["words"]?.string ?? ""
      XCTAssertEqual(RoutineSchedule.relative(item["ms"]?.double ?? 0, now: now, zone: zone), words, "\(item)")
    }
    XCTAssertEqual(RoutineSchedule.when(now - 30_000, now: now, zone: .current), "Just now")
  }

  func testEventsReadSavedAndWorded() {
    XCTAssertEqual(data["rows"]?.array?.count, 14)
    for item in data["rows"]?.array ?? [] {
      guard let member = item["member"], let row = TriggerRow.rows(member).first else { return XCTFail("no row for \(String(describing: item["member"]))") }
      XCTAssertEqual(row.member, item["back"], "saved again: \(member)")
      XCTAssertEqual(row.words.lead, item["lead"]?.string, "lead: \(member)")
      XCTAssertEqual(row.words.rest, item["rest"]?.string, "rest: \(member)")
    }
    XCTAssertEqual(TriggerRow.trigger(TriggerRow.rows(data["rows"]?[0]?["member"]) + TriggerRow.rows(data["rows"]?[1]?["member"])), data["group"])
    XCTAssertNil(TriggerRow.trigger([]))
  }

  func testEditsTheWindowRefuses() {
    func row(_ j: JSON) -> TriggerRow {
      switch j["platform"]?.string {
      case "slack": return .slack(channel: j["channel"]?.string ?? "", match: j["match"]?.string ?? "", keyword: j["keyword"]?.string ?? "", emoji: j["emoji"]?.string ?? "", bySelf: j["bySelf"]?.bool ?? false)
      case "github": return .github(repo: j["repo"]?.string ?? "", events: (j["events"]?.array ?? []).compactMap(\.string), userAllowlist: j["userAllowlist"]?.string ?? "", ciBranch: j["ciBranch"]?.string ?? "")
      case "microsoftTeams": return .teams(tenantId: j["tenantId"]?.string ?? "", teamIds: j["teamIds"]?.string ?? "", channelIds: j["channelIds"]?.string ?? "", messageContains: j["messageContains"]?.string ?? "", isRegex: j["messageContainsIsRegex"]?.bool ?? false, linkedOnly: j["blockUnauthenticatedTeamsUsers"]?.bool ?? false)
      default: return .schedule(j["schedule"]?.string ?? "")
      }
    }
    XCTAssertEqual(data["edits"]?.array?.count, 10)
    for item in data["edits"]?.array ?? [] {
      let edited = row(item["row"] ?? .null)
      XCTAssertEqual(edited.member ?? .null, item["member"] ?? .null, "\(String(describing: item["row"]))")
    }
  }
}

/** The routine list's and editor's rules that are plain words and choices, against the shipped window's. */
final class RoutineEditorTests: XCTestCase {
  func routine(_ json: JSON) -> Routine { Routine(json: json)! }

  func testRecordsAndOrder() {
    let a = routine(["id": "a", "name": "A", "prompt": "p", "isEnabled": false, "triggerDescription": "Every hour", "trigger": ["type": "cron", "schedule": "0 * * * *"]])
    let b = routine(["id": "b", "name": "B", "prompt": "p", "isEnabled": true, "triggerDescription": "Every day at 8:00 AM",
                     "trigger": ["type": "group", "listeners": [["type": "slack", "channel": "#x", "match": ["kind": "mention"]], ["type": "cron", "schedule": "0 8 * * *"]]],
                     "runs": [["id": "r1", "trigger": "manual", "startedAt": 5, "status": "running"]]])
    XCTAssertEqual(Routine.listed([a, b]).map(\.id), ["b", "a"])
    XCTAssertEqual(a.rowDetail, "Paused")
    XCTAssertEqual(b.rowDetail, "Every day at 8:00 AM")
    XCTAssertEqual(b.schedule, "0 8 * * *")
    XCTAssertTrue(b.isRunning)
    XCTAssertEqual(b.runs.first?.trigger, "manual")
  }

  func testSavingRules() {
    XCTAssertNil(RoutineDraft.newSpec(name: " ", prompt: "x", trigger: ["type": "cron", "schedule": "0 * * * *"], isEnabled: true))
    XCTAssertNil(RoutineDraft.newSpec(name: "n", prompt: "x", trigger: nil, isEnabled: true))
    let spec = RoutineDraft.newSpec(name: " n ", prompt: "x", trigger: ["type": "cron", "schedule": "0 * * * *"], isEnabled: false)
    XCTAssertEqual(spec?["name"]?.string, "n")
    XCTAssertEqual(spec?["isEnabled"]?.bool, false)
    let stored = routine(["id": "a", "name": "Old", "prompt": "Do it", "isEnabled": true, "trigger": ["type": "cron", "schedule": "0 * * * *"]])
    let update = RoutineDraft.updateSpec(stored, name: "", prompt: "New", trigger: nil)
    XCTAssertEqual(update["name"]?.string, "Old")
    XCTAssertEqual(update["prompt"]?.string, "New")
    XCTAssertEqual(update["trigger"]?["schedule"]?.string, "0 * * * *")
    // The record a create made: same name first, then the newest (`v$n`).
    let made = [routine(["id": "x", "name": "Other", "createdAt": 9]), routine(["id": "y", "name": "Mine", "createdAt": 3]), stored]
    XCTAssertEqual(RoutineDraft.created(made, before: ["a"], name: "Mine")?.id, "y")
    XCTAssertEqual(RoutineDraft.created(made, before: ["a"], name: "None")?.id, "x")
  }

  func testWords() {
    XCTAssertEqual(RoutineWords.monthsLabel(nil), "Any month")
    XCTAssertEqual(RoutineWords.monthsLabel([3, 1, 3]), "Jan, Mar")
    XCTAssertEqual(RoutineWords.weekdaysLabel([2, 1]), "Mon, Tue")
    XCTAssertEqual(RoutineWords.monthDaysLabel([15, 1]), "1st, 15th")
    XCTAssertEqual(RoutineWords.gitButton([]), "Pick events")
    XCTAssertEqual(RoutineWords.gitButton(["pr-opened", "ci-failed"]), "Opened +1")
    XCTAssertEqual(RoutineWords.addLabel(rows: 0), "Add trigger")
    XCTAssertEqual(RoutineWords.runStatus("ok"), "Succeeded")
  }

  func testCrop() {
    var crop = AvatarCrop(width: 200, height: 100)
    XCTAssertEqual(crop.side, 100)
    crop = crop.panned(dx: 10, dy: 30)
    XCTAssertEqual(crop.centerX, 100 - 10 / 0.96, accuracy: 1e-9)
    XCTAssertEqual(crop.centerY, 50)
    crop = crop.zoomed(to: 9)
    XCTAssertEqual(crop.zoom, 5)
    XCTAssertEqual(crop.side, 20)
    crop = crop.panned(dx: -1000, dy: -1000)
    XCTAssertEqual(crop.centerX, 190)
    XCTAssertEqual(crop.centerY, 90)
    XCTAssertEqual(crop.rect.x, 180)
    XCTAssertEqual(AvatarCrop.zoomStep, 0.5)
    XCTAssertEqual(AvatarCrop.fitted(width: 4000, height: 2000).width, 1024)
    XCTAssertEqual(AvatarCrop.fitted(width: 4000, height: 2000).height, 512)
    XCTAssertEqual(AvatarCrop.sizeProblem(bytes: 26 * 1024 * 1024), "Choose an image smaller than 25 MB.")
  }
}
