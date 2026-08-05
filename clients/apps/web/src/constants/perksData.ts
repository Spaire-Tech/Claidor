export type ContentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'ordered-list'; label?: string; items: string[] }
  | { type: 'unordered-list'; label?: string; items: string[] }
  | { type: 'note'; text: string }

export interface PerkSection {
  heading: string
  blocks: ContentBlock[]
}

export interface PerkDetails {
  claimUrl: string
  sections: PerkSection[]
}

export interface Perk {
  name: string
  logo: string
  incentive: string
  description: string
  url: string
  featured?: boolean
  hidden?: boolean
  details?: PerkDetails
}

export const PERKS: Perk[] = [
  {
    name: 'Deel',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/deel+logo.png',
    incentive: '$1,000 in Combined Credits',
    description:
      'Through our partnership with Deel, startups receive $1,000 in onboarding value: $500 in Deel credits for global hiring and payroll, and $500 in Spaire credits to offset revenue fees as you scale internationally.',
    url: 'https://get.deel.com/i4rqw957p9cm',
    featured: true,
    details: {
      claimUrl: 'https://get.deel.com/i4rqw957p9cm',
      sections: [
        {
          heading: 'What is Deel?',
          blocks: [
            {
              type: 'paragraph',
              text: 'Deel is a global hiring and payroll platform that lets startups hire full-time employees or contractors in 150+ countries without setting up local entities.',
            },
            {
              type: 'paragraph',
              text: 'They handle employment contracts, payroll, taxes, and compliance — so you can build your team anywhere in the world without legal complexity slowing you down.',
            },
            {
              type: 'paragraph',
              text: "If you're hiring internationally, Deel removes months of setup and thousands in entity costs.",
            },
          ],
        },
        {
          heading: 'How the $1,000 Incentive Works',
          blocks: [
            {
              type: 'ordered-list',
              label: 'To qualify, you must:',
              items: [
                'Sign up for Deel using our partner link',
                'Complete a hiring milestone within 90 days, such as:',
              ],
            },
            {
              type: 'unordered-list',
              items: [
                'Hire and pay 1 full-time employee through Deel EOR',
                'Pay 1 international contractor',
                'Run your first payroll cycle through Deel',
              ],
            },
            {
              type: 'unordered-list',
              label: 'Once completed, you receive:',
              items: [
                '$500 in Deel billing credits (applied to eligible Deel fees)',
                '$500 in Spaire revenue credits (applied toward your Spaire platform fees)',
              ],
            },
          ],
        },
        {
          heading: 'Important Notes',
          blocks: [
            {
              type: 'unordered-list',
              items: [
                'Credits are applied to billing fees, not paid out as cash.',
                'The hiring milestone must be completed within 90 days of signing up through the partner link.',
                'Both incentives are unlocked once the qualifying milestone is verified.',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    name: 'Notion + Notion AI',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/notionhq_logo.jpeg',
    incentive: '6 Months Free + Notion AI',
    description:
      'Spaire has partnered with Notion to give early-stage startups 6 months of Notion Business — with Notion AI included. One workspace for your docs, specs, roadmaps, and team knowledge, with AI built in from day one.',
    url: 'https://ntn.so/spaire',
    featured: true,
    details: {
      claimUrl: 'https://ntn.so/spaire',
      sections: [
        {
          heading: 'What is Notion?',
          blocks: [
            {
              type: 'paragraph',
              text: 'Notion is the all-in-one workspace used by startups to manage docs, product specs, wikis, roadmaps, hiring pipelines, and internal knowledge.',
            },
            {
              type: 'paragraph',
              text: 'With Notion AI, your team can draft docs, summarize meetings, generate specs, and move faster without switching tools.',
            },
            {
              type: 'paragraph',
              text: 'For early-stage startups, it often becomes the operating system for the entire company.',
            },
          ],
        },
        {
          heading: 'What You Get',
          blocks: [
            {
              type: 'unordered-list',
              label: 'Eligible startups receive:',
              items: [
                '6 months free of Notion Business',
                'Notion AI included',
              ],
            },
            {
              type: 'paragraph',
              text: 'This gives your team full access to collaboration, advanced permissions, and AI-powered workflows from day one.',
            },
          ],
        },
        {
          heading: 'How to Redeem',
          blocks: [
            {
              type: 'ordered-list',
              label: 'To qualify, you must:',
              items: [
                'Apply through our unique partner link',
                'Be a new, non-paying Notion customer',
                'Have fewer than 100 employees',
              ],
            },
            {
              type: 'note',
              text: 'Applications must be submitted through the link above. Applications sent outside this link cannot be attributed and will not qualify.',
            },
          ],
        },
      ],
    },
  },
  {
    name: 'Mercury',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/mercurybank_logo.jpeg',
    incentive: '$250 Mercury Credit + $250 Spaire Credit',
    description:
      'Open a Mercury startup bank account through Spaire and receive $250 in Mercury credits plus $250 in Spaire platform credits. Mercury provides modern banking built for startups, with powerful financial tools and integrations.',
    url: 'https://mercury.com/r/spaire',
    featured: true,
    details: {
      claimUrl: 'https://mercury.com/r/spaire',
      sections: [
        {
          heading: 'What is Mercury?',
          blocks: [
            {
              type: 'paragraph',
              text: 'Mercury is a banking platform built specifically for startups. It provides business checking and savings accounts, payment tools, and financial infrastructure designed for fast-growing companies.',
            },
            {
              type: 'paragraph',
              text: 'Founders use Mercury to manage company finances, send and receive payments, and connect their bank account with the tools they already use to run their business. The platform is widely used by technology startups and supports companies from formation through scaling.',
            },
            {
              type: 'paragraph',
              text: 'Because Mercury is built for startups, it also includes features like team permissions, integrations with accounting tools, and APIs for building financial workflows.',
            },
          ],
        },
        {
          heading: 'How the $500 Incentive Works',
          blocks: [
            {
              type: 'ordered-list',
              label: 'To qualify, you must:',
              items: [
                'Open a new Mercury business account using the Spaire partner link',
                'Deposit $10,000 into your Mercury account within your first 90 days',
              ],
            },
            {
              type: 'unordered-list',
              label: 'Once completed, you receive:',
              items: [
                '$250 in cash from Mercury',
                '$250 in Spaire platform credits',
              ],
            },
          ],
        },
        {
          heading: 'Important Notes',
          blocks: [
            {
              type: 'unordered-list',
              items: [
                'The $10,000 deposit must be completed within 90 days of opening your Mercury account.',
                'The $250 reward is issued directly by Mercury once the requirement is met.',
                'Spaire credits are applied to Spaire platform fees and are not paid out as cash.',
                'Mercury determines final eligibility and account approval.',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    name: 'AWS',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/amazon_web_services_logo.jpeg',
    incentive: '$5,000 in Credits',
    description:
      'Amazon Web Services is the backbone of modern cloud infrastructure. From compute and storage to machine learning and serverless, AWS gives you the scale and reliability that enterprise customers demand.',
    url: 'https://aws.amazon.com/activate/',
  },
  {
    name: 'Stripe Atlas',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/stripe_logo.jpeg',
    incentive: '$500 in Processing Credits',
    description:
      'Stripe Atlas incorporates your Delaware C-Corp, sets up your bank account, and gives you the legal templates to get funded — in days, not weeks.',
    url: 'https://stripe.com/atlas',
  },
  {
    name: 'HubSpot',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/hubspot_logo.jpeg',
    incentive: '90% Off Year One',
    description:
      'HubSpot gives you CRM, email marketing, sales pipelines, and customer support in one platform — replacing the patchwork of disconnected tools that slow early teams down.',
    url: 'https://www.hubspot.com/startups',
  },
  {
    name: 'PostHog',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/posthog_logo.jpeg',
    incentive: '$50K in Credits',
    description:
      'PostHog is the open-source product analytics suite that replaces Amplitude, LaunchDarkly, and Hotjar in one self-serve tool. Event tracking, feature flags, session recording, and A/B testing.',
    url: 'https://posthog.com/startups',
  },
  {
    name: 'Linear',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/linear.jpeg',
    incentive: '6 Months Free',
    description:
      'Build and ship products faster with Linear. Plan features, track bugs, and keep your engineering team aligned with a project management tool designed for modern software teams.',
    url: 'https://linear.app/coupon/hydrargyrum',
    featured: true,
    details: {
      claimUrl: 'https://linear.app/coupon/hydrargyrum',
      sections: [
        {
          heading: 'What is Linear?',
          blocks: [
            {
              type: 'paragraph',
              text: 'Linear is a project management and issue tracking tool built for modern product teams. It helps startups plan features, track bugs, manage product roadmaps, and coordinate development work in one streamlined platform.',
            },
            {
              type: 'paragraph',
              text: 'Many fast-growing startups use Linear to organize engineering tasks, prioritize product improvements, and keep their teams aligned while shipping new features quickly.',
            },
          ],
        },
        {
          heading: 'What You Get Through the Spaire Startup Stack',
          blocks: [
            {
              type: 'unordered-list',
              label: 'Eligible startups receive:',
              items: ['6 months of Linear free'],
            },
            {
              type: 'paragraph',
              text: "This gives founders access to Linear's project management and issue tracking tools while they build and launch their product.",
            },
          ],
        },
        {
          heading: 'How to Redeem',
          blocks: [
            {
              type: 'ordered-list',
              items: [
                'Redeem the offer through the Linear partner site',
                'Sign up for a new Linear account',
                'Use the redemption code hydrargyrum during signup to activate the offer',
              ],
            },
            {
              type: 'note',
              text: 'The redemption code hydrargyrum must be entered during signup. Applications submitted without the code cannot be attributed.',
            },
          ],
        },
        {
          heading: 'Eligibility Requirements',
          blocks: [
            {
              type: 'ordered-list',
              label: 'To qualify, you must:',
              items: ['Be a new Linear customer'],
            },
          ],
        },
        {
          heading: 'Important Notes',
          blocks: [
            {
              type: 'unordered-list',
              items: [
                'The 6-month free offer applies to new Linear accounts only.',
                'The redemption code must be used during signup to activate the benefit.',
                'Terms and availability are determined by Linear.',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    name: 'Intercom',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/intercom_logo.jpeg',
    incentive: 'Free for First Year',
    description:
      'Communicate with your users from day one using Intercom. Manage support conversations, onboard new customers, and automate responses with powerful messaging and AI tools.',
    url: 'https://www.intercom.com/startups-program',
    featured: true,
    details: {
      claimUrl: 'https://www.intercom.com/startups-program',
      sections: [
        {
          heading: 'What is Intercom?',
          blocks: [
            {
              type: 'paragraph',
              text: 'Intercom is a customer communication and support platform that helps startups interact with users through live chat, in-app messaging, email, and automated support.',
            },
            {
              type: 'paragraph',
              text: 'It allows companies to manage customer conversations, onboard new users, and resolve support requests from one place. Intercom also includes AI tools that can automatically answer common questions and help support teams respond faster.',
            },
            {
              type: 'paragraph',
              text: 'Many startups use Intercom to manage customer support, onboarding messages, and product communication as their user base grows.',
            },
          ],
        },
        {
          heading: 'What You Get Through the Spaire Startup Stack',
          blocks: [
            {
              type: 'unordered-list',
              label: 'Eligible startups receive:',
              items: ['Intercom free for the first year'],
            },
            {
              type: 'paragraph',
              text: "The offer gives founders access to Intercom's customer messaging and support platform so they can build strong relationships with their first users while keeping costs low.",
            },
          ],
        },
        {
          heading: 'Eligibility Requirements',
          blocks: [
            {
              type: 'ordered-list',
              label: 'To qualify, you must:',
              items: [
                'Be a new Intercom customer',
                'Be an early-stage startup',
                "Meet Intercom's program requirements for startup eligibility",
              ],
            },
          ],
        },
        {
          heading: 'Important Notes',
          blocks: [
            {
              type: 'unordered-list',
              items: [
                'The free access applies for the first year only.',
                'After the first year, standard pricing may apply.',
                'Additional usage features may be billed separately.',
                'Final eligibility and approval are determined by Intercom.',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    name: 'Vercel',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/vercel_logo.jpeg',
    incentive: '$3,000 in Credits',
    description:
      'Vercel is the deployment platform built for frontend teams. Instant global deploys, edge functions, and built-in analytics — purpose-built for Next.js but compatible with any framework.',
    url: 'https://vercel.com/startups',
  },
  {
    name: 'OpenAI',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/open+ai+-+logo.jpg',
    incentive: '$2,500 in API Credits',
    description:
      'OpenAI provides the foundational AI models that power the next generation of software products — from GPT-4 to embeddings and fine-tuning.',
    url: 'https://openai.com/startups',
  },
  {
    name: 'Airtable',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/airtable-logo.jpeg',
    incentive: '$2,000 in Credits',
    description:
      'Airtable is the programmable spreadsheet that ops teams use to build internal tools without engineering resources — from CRM to content calendars to inventory tracking.',
    url: 'https://www.airtable.com/startups',
  },
  {
    name: 'Mixpanel',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/mixpanel_inc__logo.jpeg',
    incentive: '$50K in Credits',
    description:
      'Mixpanel is the event-based analytics platform that tells you what users actually do in your product — funnels, retention analysis, and cohort breakdowns that drive real product decisions.',
    url: 'https://mixpanel.com/startups',
  },
  {
    name: 'Apollo',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/Apolo+logo.jpg',
    incentive: '50% Off Annual Plan',
    description:
      'Spaire startups receive 50% off Apollo\'s sales intelligence platform for one year. Access a database of over 270M contacts and powerful outreach tools to find customers, start conversations, and grow your first revenue.',
    url: 'https://www.apollo.io/partners/partnership-startup-promo?utm_medium=partner&utm_source=communities_startup&utm_campaign=communities_spaire',
    featured: true,
    details: {
      claimUrl: 'https://www.apollo.io/partners/partnership-startup-promo?utm_medium=partner&utm_source=communities_startup&utm_campaign=communities_spaire',
      sections: [
        {
          heading: 'What is Apollo?',
          blocks: [
            {
              type: 'paragraph',
              text: 'Apollo is a sales intelligence and outreach platform that helps startups find potential customers and start conversations with them.',
            },
            {
              type: 'paragraph',
              text: 'It combines a database of over 270 million contacts with tools for lead generation, email outreach, and sales automation in one platform.',
            },
            {
              type: 'paragraph',
              text: "Many early-stage startups use Apollo to identify decision makers, build prospect lists, and run outbound campaigns when they're trying to land their first customers.",
            },
          ],
        },
        {
          heading: 'What You Get Through the Spaire Startup Stack',
          blocks: [
            {
              type: 'unordered-list',
              label: 'Eligible startups receive:',
              items: ['50% off an annual Apollo plan for one year'],
            },
            {
              type: 'unordered-list',
              label: 'The discount applies to:',
              items: ['Basic plan', 'Professional plan'],
            },
            {
              type: 'paragraph',
              text: 'The offer can be used for up to 5 team seats.',
            },
          ],
        },
        {
          heading: 'Eligibility Requirements',
          blocks: [
            {
              type: 'ordered-list',
              label: 'To qualify, your company must:',
              items: [
                'Have 20 or fewer employees',
                'Be a new Apollo customer',
                'Choose an annual Basic or Professional plan',
              ],
            },
          ],
        },
        {
          heading: 'Important Notes',
          blocks: [
            {
              type: 'unordered-list',
              items: [
                'The discount is valid for one year only.',
                'Applies to Basic or Professional annual plans.',
                'Up to 5 seats per company are eligible.',
                'Offer is for new Apollo customers only.',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    name: 'DocSend',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/doc+send+logo.png',
    incentive: '90% Off for the First Year',
    description:
      'Share investor decks, fundraising materials, and key documents securely with DocSend. Spaire startups receive 90% off for the first year, with analytics that show who opened your documents and how they engaged with them.',
    url: 'https://experience.docsend.com/dfyk3wcsklzs',
    featured: true,
    details: {
      claimUrl: 'https://experience.docsend.com/dfyk3wcsklzs',
      sections: [
        {
          heading: 'What is DocSend?',
          blocks: [
            {
              type: 'paragraph',
              text: 'DocSend is a secure document sharing and analytics platform that helps startups share important files and track how they\'re viewed.',
            },
            {
              type: 'paragraph',
              text: 'Instead of sending attachments, founders can share a secure DocSend link and see who opened the document, when it was viewed, and how much time was spent on each page. This helps founders understand which investors or partners are most engaged and follow up at the right moment.',
            },
            {
              type: 'paragraph',
              text: 'Startups commonly use DocSend to share investor pitch decks, fundraising materials, sales proposals, and partnership documents.',
            },
          ],
        },
        {
          heading: 'What You Get Through the Spaire Startup Stack',
          blocks: [
            {
              type: 'unordered-list',
              label: 'Eligible startups receive:',
              items: ['90% off DocSend for the first year'],
            },
            {
              type: 'paragraph',
              text: "This gives founders access to secure document sharing and engagement analytics at a significantly reduced cost while they're building and fundraising.",
            },
          ],
        },
        {
          heading: 'Eligibility Requirements',
          blocks: [
            {
              type: 'ordered-list',
              label: 'To qualify for the discount, you must:',
              items: [
                'Be a new DocSend customer',
                'Activate your account through the startup partner offer',
                'Redeem the discount when selecting your plan',
              ],
            },
          ],
        },
        {
          heading: 'Important Notes',
          blocks: [
            {
              type: 'unordered-list',
              items: [
                'The discount applies for the first year only.',
                'The offer is valid for new DocSend customers.',
                'Terms and availability are determined by DocSend and may change.',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    name: 'Microsoft Azure',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/Microsoft+Logo.png',
    incentive: 'Up to $5,000 in Cloud Credits',
    description:
      "Spaire startups can access up to $5,000 in Microsoft Azure credits to build and scale their products in the cloud. Use Azure's infrastructure to host applications, run databases, and power your startup's backend services.",
    url: 'https://www.microsoft.com/en-us/startups?utm_source=mercury',
    featured: true,
    details: {
      claimUrl: 'https://www.microsoft.com/en-us/startups?utm_source=mercury',
      sections: [
        {
          heading: 'What is Microsoft Azure?',
          blocks: [
            {
              type: 'paragraph',
              text: 'Microsoft Azure is a cloud computing platform that allows startups to build, host, and scale applications without managing their own infrastructure.',
            },
            {
              type: 'paragraph',
              text: 'Founders use Azure to run backend services, databases, AI workloads, and web applications in the cloud. The platform provides a wide range of tools for developers, including compute services, storage, networking, and machine learning infrastructure.',
            },
            {
              type: 'paragraph',
              text: 'For startups building software products, Azure can handle everything from hosting APIs to powering large-scale applications as the company grows.',
            },
          ],
        },
        {
          heading: 'What You Get Through the Spaire Startup Stack',
          blocks: [
            {
              type: 'unordered-list',
              label: 'Eligible startups can access:',
              items: ['Up to $5,000 in Microsoft Azure credits'],
            },
            {
              type: 'paragraph',
              text: 'These credits can be used toward Azure infrastructure and services while building and launching your product.',
            },
          ],
        },
        {
          heading: 'Eligibility Requirements',
          blocks: [
            {
              type: 'ordered-list',
              label: 'To get started, you must:',
              items: [
                'Be a new Azure customer with no prior Azure account',
                'Sign up using a valid personal Microsoft account',
                'Be located in a country or region where the Azure offer is available',
              ],
            },
          ],
        },
        {
          heading: 'Important Notes',
          blocks: [
            {
              type: 'unordered-list',
              items: [
                'Credits can be used for eligible Azure cloud services.',
                'The offer is subject to Microsoft eligibility requirements.',
                "Availability and terms may change based on Microsoft's program rules.",
              ],
            },
          ],
        },
      ],
    },
  },
  {
    name: 'Carta',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/carta___logo.jpg',
    incentive: '20% Off First Year',
    description:
      "Manage your company's ownership from the start with Carta. Track your cap table, issue equity to founders and employees, and stay organized as you raise funding and grow your team.",
    url: 'https://carta.com/partners/referral/requestdemo-is/?mercury&PID=mercury/?utm_medium=bdreferral&utm_source=mercury/',
    featured: true,
    details: {
      claimUrl: 'https://carta.com/partners/referral/requestdemo-is/?mercury&PID=mercury/?utm_medium=bdreferral&utm_source=mercury/',
      sections: [
        {
          heading: 'What is Carta?',
          blocks: [
            {
              type: 'paragraph',
              text: 'Carta is a platform that helps companies and investors manage ownership, equity, and fund operations.',
            },
            {
              type: 'paragraph',
              text: 'Many startups use Carta to manage their cap table, issue equity to founders and employees, and track investors as they raise funding. The platform is also widely used by venture capital firms and fund managers to administer their funds and streamline operational processes.',
            },
            {
              type: 'paragraph',
              text: 'Carta is trusted by leading investment firms and startup ecosystems to manage equity and fund administration at scale.',
            },
          ],
        },
        {
          heading: 'What You Get Through the Spaire Startup Stack',
          blocks: [
            {
              type: 'unordered-list',
              label: 'Eligible startups receive:',
              items: ["20% off the first year of Carta's Fund Administration services"],
            },
            {
              type: 'paragraph',
              text: 'This discount helps early-stage funds and investment groups reduce operational costs while managing their fund structure and investor relationships.',
            },
          ],
        },
        {
          heading: 'How to Redeem',
          blocks: [
            {
              type: 'ordered-list',
              items: [
                'Redeem the offer through the Carta partner site',
                "Sign up for Carta's Fund Administration services",
                'The 20% discount will be applied to your first year',
              ],
            },
          ],
        },
        {
          heading: 'Eligibility Requirements',
          blocks: [
            {
              type: 'ordered-list',
              label: 'To qualify, you must:',
              items: ['Be a new Carta customer'],
            },
          ],
        },
        {
          heading: 'Important Notes',
          blocks: [
            {
              type: 'unordered-list',
              items: [
                'The discount applies to the first year of Carta Fund Administration services.',
                'The offer is valid for new customers only.',
                'Final eligibility and terms are determined by Carta.',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    name: 'Upwork',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/upwork_logo.jpg',
    incentive: '50% Off for 90 Days',
    description:
      'Find specialized talent quickly with Upwork. Startups use Upwork to hire designers, engineers, marketers, and other experts from around the world without the overhead of traditional hiring.',
    url: 'https://www.upwork.com/offers/investment-backed?utm_source=mercury%20&utm_medium=partner_offers&utm_campaign=channel_partnerships&utm_content=mercury_offers_page&campaign_message=promo',
    featured: true,
    details: {
      claimUrl: 'https://www.upwork.com/offers/investment-backed?utm_source=mercury%20&utm_medium=partner_offers&utm_campaign=channel_partnerships&utm_content=mercury_offers_page&campaign_message=promo',
      sections: [
        {
          heading: 'What is Upwork?',
          blocks: [
            {
              type: 'paragraph',
              text: 'Upwork is a global marketplace that connects businesses with independent professionals and agencies across a wide range of fields.',
            },
            {
              type: 'paragraph',
              text: 'Startups use Upwork to find specialized talent for projects such as product development, design, marketing, engineering, and AI. The platform allows companies to hire quickly, manage contracts, and collaborate with freelancers from around the world without the overhead of traditional hiring.',
            },
            {
              type: 'paragraph',
              text: 'Many startups rely on Upwork to access expert talent and scale their teams as their company grows.',
            },
          ],
        },
        {
          heading: 'What You Get Through the Spaire Startup Stack',
          blocks: [
            {
              type: 'unordered-list',
              label: 'Eligible startups can receive:',
              items: [
                '50% off client fees for 90 days on the Upwork Business Plus plan',
                '$100 in Upwork credits when you spend $500 hiring talent on the marketplace',
              ],
            },
            {
              type: 'paragraph',
              text: 'These offers help founders access global talent while reducing hiring costs during the early stages of building their company.',
            },
          ],
        },
        {
          heading: 'How to Redeem',
          blocks: [
            {
              type: 'ordered-list',
              items: [
                'Sign up for the Upwork Business Plus plan through the partner link to receive 50% off client fees for 90 days',
                'Or sign up through the partner link and receive $100 in Upwork credits after spending $500 on hiring talent',
              ],
            },
          ],
        },
        {
          heading: 'Eligibility Requirements',
          blocks: [
            {
              type: 'ordered-list',
              label: 'To qualify, you must:',
              items: [
                'Create a new Upwork account',
                'Sign up through the partner redemption link',
                "Meet Upwork's eligibility requirements for the selected offer",
              ],
            },
          ],
        },
        {
          heading: 'Important Notes',
          blocks: [
            {
              type: 'unordered-list',
              items: [
                'The 50% discount applies for the first 90 days on the Business Plus plan.',
                'The $100 credit is unlocked after spending $500 on hiring talent.',
                'Offers may vary based on eligibility and region.',
                'Full program rules and terms are determined by Upwork.',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    name: 'Slack',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/slack_logo.jpg',
    incentive: '25% Off for 12 Months',
    description:
      'Keep your team connected with Slack. Organize conversations in channels, collaborate in real time, and integrate the tools your startup uses to build and run its product.',
    url: 'https://slack.com/promo/partner?remote_promo=0b08613b',
    featured: true,
    details: {
      claimUrl: 'https://slack.com/promo/partner?remote_promo=0b08613b',
      sections: [
        {
          heading: 'What is Slack?',
          blocks: [
            {
              type: 'paragraph',
              text: 'Slack is a collaboration platform that helps teams communicate and work together in one place.',
            },
            {
              type: 'paragraph',
              text: 'It organizes conversations into channels and integrates with hundreds of tools used by startups, including project management platforms, developer tools, and customer support systems. This allows teams to centralize discussions, share files, and automate workflows across their organization.',
            },
            {
              type: 'paragraph',
              text: 'Many startups use Slack as their digital headquarters, connecting their team, tools, customers, and partners in one platform.',
            },
          ],
        },
        {
          heading: 'What You Get Through the Spaire Startup Stack',
          blocks: [
            {
              type: 'unordered-list',
              label: 'Eligible startups receive:',
              items: ['25% off Slack plan upgrades for the first 12 months'],
            },
            {
              type: 'paragraph',
              text: 'The discount applies to eligible upgrades to Slack Pro or Business+ plans, available on either monthly or annual billing.',
            },
          ],
        },
        {
          heading: 'How to Redeem',
          blocks: [
            {
              type: 'ordered-list',
              items: [
                'Redeem the offer through the Slack partner site',
                'Choose an eligible Slack Pro or Business+ plan',
                'The 25% discount will be applied to your plan upgrade for the first 12 months',
              ],
            },
          ],
        },
        {
          heading: 'Eligibility Requirements',
          blocks: [
            {
              type: 'ordered-list',
              label: 'To qualify, your company must:',
              items: [
                'Have 200 or fewer employees',
                'Upgrade to an eligible Slack Pro or Business+ plan',
              ],
            },
          ],
        },
        {
          heading: 'Important Notes',
          blocks: [
            {
              type: 'unordered-list',
              items: [
                'The 25% discount applies for the first 12 months only.',
                'The offer applies to eligible plan upgrades, not free plans.',
                'Final eligibility and availability are determined by Slack.',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    name: 'Google Cloud',
    logo: 'https://spaire-production-files-public.s3.us-east-1.amazonaws.com/google_cloud_logo.jpg',
    incentive: 'Up to $200K in Credits',
    hidden: true,
    description:
      'Run and scale your product on Google Cloud. Build your backend infrastructure, host applications, and leverage powerful cloud services including databases, AI tools, and analytics.',
    url: 'https://cloud.google.com/startup/apply?utm_campaign=FY21-Q1-global-demandgen-website-cs-startup_program_mc&utm_content=Mercury&utm_source=CJ&utm_medium=affiliate&refparam=CJ-16985197-100861638',
    featured: true,
    details: {
      claimUrl: 'https://cloud.google.com/startup/apply?utm_campaign=FY21-Q1-global-demandgen-website-cs-startup_program_mc&utm_content=Mercury&utm_source=CJ&utm_medium=affiliate&refparam=CJ-16985197-100861638',
      sections: [
        {
          heading: 'What is Google Cloud?',
          blocks: [
            {
              type: 'paragraph',
              text: 'Google Cloud is a cloud computing platform that allows startups to build, host, and scale applications without managing their own infrastructure.',
            },
            {
              type: 'paragraph',
              text: 'It provides services for computing, databases, storage, analytics, and artificial intelligence, along with developer tools like Firebase for building and running modern applications.',
            },
            {
              type: 'paragraph',
              text: 'Many startups rely on Google Cloud to power their backend infrastructure, run machine learning workloads, and scale their products as their user base grows.',
            },
          ],
        },
        {
          heading: 'What You Get Through the Spaire Startup Stack',
          blocks: [
            {
              type: 'unordered-list',
              label: 'Eligible startups can receive:',
              items: ['Up to $200,000 in Google Cloud and Firebase credits over 2 years'],
            },
            {
              type: 'paragraph',
              text: 'Startups may also gain access to technical training, startup experts, curated resources, and additional benefits for AI and Web3 projects.',
            },
          ],
        },
        {
          heading: 'How to Redeem',
          blocks: [
            {
              type: 'ordered-list',
              items: [
                'Redeem the offer through the Google Cloud Startup Program partner page',
                'If you do not yet have a Google Cloud account, start a free trial and receive $350 in free trial credits for 90 days',
                'Apply to the Google Cloud for Startups program using your company details and billing account',
              ],
            },
          ],
        },
        {
          heading: 'Eligibility Requirements',
          blocks: [
            {
              type: 'ordered-list',
              label: 'To qualify for the program, you must:',
              items: [
                'Have a Google Cloud account with an active Billing ID',
                'Have a publicly available company website',
                'Use a company email domain that matches your website',
                'Have a company founded within the last 5 years',
              ],
            },
          ],
        },
        {
          heading: 'Important Notes',
          blocks: [
            {
              type: 'unordered-list',
              items: [
                'Credits may cover Google Cloud and Firebase services.',
                'Final approval is determined by the Google Cloud for Startups program.',
                'Applicants must review and accept the Google Cloud Startup Program terms.',
                'Benefits and credit amounts may vary based on eligibility.',
              ],
            },
          ],
        },
      ],
    },
  },
]

export const FEATURED_PERKS = PERKS.filter((p) => p.featured && !p.hidden)
export const OTHER_PERKS = PERKS.filter((p) => !p.featured && !p.hidden)
