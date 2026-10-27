export default {
  checkout: {
    footer: {
      poweredBy: 'Powered by',
      mandateSubscriptionTrial:
        'By clicking "{buttonLabel}," you authorize Simeon Labs to charge your selected payment method in the amount shown above at the end of your trial period and on each subsequent billing date until you cancel. You may cancel at any time before the end of your trial to avoid being charged.',
      mandateSubscription:
        'By clicking "{buttonLabel}," you authorize Simeon Labs to immediately charge your selected payment method in the amount shown above and to charge the same amount on each subsequent billing date until you cancel.',
      mandateOneTime:
        'By clicking "{buttonLabel}," you authorize Simeon Labs to charge your selected payment method the amount shown above. This is a one-time charge.',
    },
    form: {
      email: 'Email',
      cardholderName: 'Cardholder name',
      purchasingAsBusiness: "I'm purchasing as a business",
      addBusinessDetails: 'Add business details',
      removeBusinessDetails: 'Remove business details',
      businessName: 'Business name',
      billingDetails: 'Business Details',
      billingAddress: {
        label: 'Billing address',
        line1: {
          value: 'Street address',
          _llmContext:
            'The first line of the billing address, typically including street address and number. Adjust to fit the most common format for the target locale.',
        },
        line2: {
          value: 'Apartment or unit number',
          _llmContext:
            'The second line of the billing address, typically used for apartment, suite, unit, building, floor, etc. Adjust to fit the most common format for the target locale.',
        },
        postalCode: 'Postal code',
        city: 'City',
        country: 'Country',
        state: 'State',
        province: 'Province',
        stateProvince: 'State / Province',
      },
      taxId: 'Tax ID',
      discountCode: 'Discount code',
      addDiscountCode: 'Add discount code',
      optional: 'Optional',
      apply: {
        value: 'Apply',
        _llmContext: 'Button text for applying a discount code.',
      },
      fieldRequired: 'This field is required',
    },
    pricing: {
      subtotal: 'Subtotal',
      taxableAmount: 'Taxable amount',
      taxes: {
        value: 'Taxes',
        _llmContext:
          'Taxes applied to the order. This is VAT or sales tax. Prefer the specific term used in the target locale over a generic taxes (e.g. TVA in French, BTW in Dutch, etc.)',
      },
      free: 'Free',
      payWhatYouWant: {
        value: 'Pay what you want',
        _llmContext:
          'A pricing type where the customer can choose how much to pay.',
      },
      total: 'Total',
      everyInterval: {
        day: {
          _mode: 'plural',
          '=1': 'Daily',
          '=2': 'Every other day',
          other: 'Every # days',
        },
        week: {
          _mode: 'plural',
          '=1': 'Weekly',
          '=2': 'Every other week',
          other: 'Every # weeks',
        },
        month: {
          _mode: 'plural',
          '=1': 'Monthly',
          '=2': 'Every other month',
          other: 'Every # months',
        },
        year: {
          _mode: 'plural',
          '=1': 'Yearly',
          '=2': 'Every other year',
          other: 'Every # years',
        },
      },
      additionalMeteredUsage: 'Additional metered usage',
      perUnit: '/ unit',
      discount: {
        duration: {
          months: {
            _mode: 'plural',
            '=1': 'for the first month',
            other: 'for the first # months',
          },
          years: {
            _mode: 'plural',
            '=1': 'for the first year',
            other: 'for the first # years',
          },
        },
      },
    },
    trial: {
      ends: 'Trial ends {endDate}',
      duration: {
        days: {
          _mode: 'plural',
          '=1': '# day trial',
          other: '# days trial',
        },
        weeks: {
          _mode: 'plural',
          '=1': '# week trial',
          other: '# weeks trial',
        },
        months: {
          _mode: 'plural',
          '=1': '# month trial',
          other: '# months trial',
        },
        years: {
          _mode: 'plural',
          '=1': '# year trial',
          other: '# years trial',
        },
      },
    },
    pwywForm: {
      label: 'Name a fair price',
      minimum: '{amount} minimum',
      amountMinimum: 'Amount must be at least {min}',
      amountFreeOrMinimum: 'Amount must be {zero} or at least {min}',
    },
    productSwitcher: {
      billedRecurring: 'Billed {frequency}',
      oneTimePurchase: 'One-time purchase',
    },
    productDescription: {
      readMore: 'Read more',
      readLess: 'Read less',
    },
    card: {
      included: 'Included',
    },
    benefits: {
      moreBenefits: {
        _mode: 'plural',
        '=1': '# more benefit',
        other: '# more benefits',
      },
      showMoreBenefits: {
        _mode: 'plural',
        '=1': 'Show # more benefit',
        other: 'Show # more benefits',
      },
      showLess: 'Show less',
      granting: 'Granting benefits...',
      requestNewInvite: 'Request new invite',
      retryIn: {
        _mode: 'plural',
        '=1': 'Try again in # second',
        other: 'Try again in # seconds',
      },
      connectNewAccount: 'Connect new account',
      requestMyInvite: 'Request my invite',
      github: {
        connect: 'Connect GitHub account',
        goTo: 'Go to {repository}',
        selectAccount: 'Select a GitHub account',
      },
      discord: {
        connect: 'Connect Discord account',
        open: 'Open Discord',
        selectAccount: 'Select a Discord account',
      },
      licenseKey: {
        copy: 'Copy',
        copiedToClipboard: 'Copied To Clipboard',
        copiedToClipboardDescription: 'License Key was copied to clipboard',
        loading: 'Loading...',
        status: 'Status',
        statusGranted: 'Granted',
        statusRevoked: 'Revoked',
        statusDisabled: 'Disabled',
        usage: 'Usage',
        validations: 'Validations',
        validatedAt: 'Validated At',
        neverValidated: 'Never Validated',
        expiryDate: 'Expiry Date',
        noExpiry: 'No Expiry',
        activations: 'Activations',
        activationDeleted: 'License Key Activation Deleted',
        activationDeletedDescription: 'Activation deleted successfully',
        activationDeactivationFailed: 'Activation Deactivation Failed',
      },
    },
    confirmation: {
      confirmPayment: 'Confirm payment',
      processingTitle: 'We are processing your order',
      successTitle: 'Your order was successful!',
      failedTitle: 'A problem occurred while processing your order',
      processingDescription: 'Please wait while we confirm your payment.',
      successDescription: "You're now eligible for the benefits of {product}.",
      failedDescription: 'Please try again or contact support.',
    },
    loading: {
      processingOrder: 'Processing order...',
      processingPayment: 'Processing payment',
      paymentSuccessful: 'Payment successful! Getting your products ready...',
      confirmationTokenFailed:
        'Failed to create confirmation token, please try again later.',
    },
    cta: {
      startTrial: 'Start trial',
      subscribeNow: 'Subscribe now',
      payNow: 'Pay now',
      getFree: 'Get for free',
      paymentsUnavailable: 'Payments are currently unavailable',
    },
  },
  intervals: {
    short: {
      day: 'dy',
      week: 'wk',
      month: 'mo',
      year: 'yr',
    },
  },
  benefitTypes: {
    license_keys: 'License keys',
    github_repository: 'GitHub repository access',
    discord: 'Discord invite',
    downloadables: 'File downloads',
    custom: 'Custom',
    meter_credit: 'Meter credits',
    feature_flag: 'Feature flag',
  },
  ordinal: {
    zero: {
      value: '',
      _llmContext:
        'Ordinal suffix for the "zero" category of Intl.PluralRules (type: ordinal). Appended to a number to form ordinals. Provide the suffix only — the number is prepended automatically. For locales where all ordinals use the same suffix (e.g. German "1.", "2."), set every key to the same value. Not used in English.',
    },
    one: {
      value: 'st',
      _llmContext:
        'Ordinal suffix for the "one" category of Intl.PluralRules (type: ordinal). Appended to a number to form ordinals (e.g. 1st, 21st, 31st in English). Provide the suffix only — the number is prepended automatically. For locales where all ordinals use the same suffix (e.g. German "1.", "2."), set every key to the same value.',
    },
    two: {
      value: 'nd',
      _llmContext:
        'Ordinal suffix for the "two" category of Intl.PluralRules (type: ordinal). Appended to a number to form ordinals (e.g. 2nd, 22nd in English). Provide the suffix only — the number is prepended automatically.',
    },
    few: {
      value: 'rd',
      _llmContext:
        'Ordinal suffix for the "few" category of Intl.PluralRules (type: ordinal). Appended to a number to form ordinals (e.g. 3rd, 23rd in English). Provide the suffix only — the number is prepended automatically.',
    },
    many: {
      value: '',
      _llmContext:
        'Ordinal suffix for the "many" category of Intl.PluralRules (type: ordinal). Appended to a number to form ordinals. Provide the suffix only — the number is prepended automatically. Not used in English.',
    },
    other: {
      value: 'th',
      _llmContext:
        'Ordinal suffix for the "other" (default/fallback) category of Intl.PluralRules (type: ordinal). Appended to a number to form ordinals (e.g. 4th, 5th, 11th in English). Provide the suffix only — the number is prepended automatically.',
    },
  },
  // Simeon's own pages on app.simeonlabs.com (20 October 2026): the sign-in
  // and the billing page. In English and French ("tu"); the checkout's other
  // languages read English here (docs/localization.md).
  simeon: {
    signIn: {
      loginTitle: 'Log in to Simeon',
      signupTitle: 'Sign up to Simeon',
      heading: 'Get it off your plate',
      line: 'Your doing partners for every part of your business.',
      continueWithGoogle: 'Continue with Google',
      continueWithApple: 'Continue with Apple',
      or: 'OR',
      email: 'Email',
      enterEmail: 'Enter your email',
      sendingCode: 'Sending code…',
      continueWithEmail: 'Continue with email',
      appleUnavailable:
        'Sign in with Apple is coming soon. Continue with Google or your email for now.',
      didNotGoThrough: 'That sign-in did not go through. Try again.',
      invalidEmail: 'Enter a valid email address.',
      couldNotSend: 'We could not send the code. Try again.',
      legal: 'By continuing, you agree to Simeon’s {terms} and {privacy}.',
      terms: 'Terms of Service',
      privacy: 'Privacy Policy',
      photo:
        'A living room built around a boulder, with white sofas and a globe hanging on a string',
      codeTitle: 'Enter verification code',
      checkEmail: 'Check your email',
      codeSentTo: 'We sent a six-character code to {email}.',
      codeSent: 'We sent you a six-character code.',
      continueWithPassword: 'Continue with password',
      differentEmail: 'Use a different email',
      signingIn: 'Signing in…',
      signIn: 'Sign in',
      passwordTitle: 'Enter your password',
      password: 'Password',
      continue: 'Continue',
      useCode: 'Use a code instead',
      noPassword:
        'No password yet? Use a code, then set one in the Simeon app under Settings › Account.',
    },
    billing: {
      title: 'Billing',
      description: 'Your Simeon plan, card and invoices',
      signedInAs: 'Signed in as {email} · ',
      logOut: 'Log out',
      allSet: "You're all set!",
      takingYouBack: 'Taking you back to Simeon to finish signing in',
      goBack: 'Go back to Simeon',
      goBackStarted: 'Your free trial has started. Go back to Simeon',
      download: 'Download Simeon to get started',
      downloadStarted:
        'Your free trial has started. Download Simeon to get started',
      continueSigningIn: 'Continue signing in to Simeon',
      openSimeon: 'Open Simeon',
      downloadMac: 'Download Simeon for macOS',
      planLine: 'Simeon {plan} · ',
      planLineTrial: 'Simeon {plan}, on trial · ',
      billedByApple:
        'Billed through Apple. Change or cancel it on your iPhone in Settings › your name › Subscriptions.',
      adjustPlan: 'Adjust your plan',
      choosePlan: 'Choose your plan',
      standardIncludes: 'Includes:',
      standardComputer: 'Each agent’s own computer',
      standardTools: 'Signs into your tools',
      standardRoutines: 'Routines on a schedule',
      standardChannels: 'Slack, Discord and voice calls',
      standardAnywhere: 'Work anywhere: Mac and iPhone',
      standardUsage: 'Weekly usage, more on demand',
      proIncludes: 'Everything in Standard, plus:',
      proUsage: '3.5x Standard usage',
      proBusy: 'For agents busy every day',
      maxIncludes: 'Everything in Pro, plus:',
      maxUsage: '9x Standard usage',
      maxAccess: 'Earliest access to all products',
      startTrial: 'Start your {plan} Trial',
      upgradeTo: 'Upgrade to {plan}',
      switchTo: 'Switch to {plan}',
      checkoutFailed: 'Could not open the checkout',
      portalFailed: 'Could not open your billing page',
      tryAgain: 'Please try again in a moment.',
      manageOnStripe: 'Manage billing on {stripe}',
      currentPlan: 'Current plan',
      perMonth: '/ month',
      freeThenMonthly: 'Free for {days} days, then monthly',
      billedMonthly: 'Billed monthly',
      yourCurrentPlan: 'Your current plan',
      oneMoment: 'One moment…',
      confirm: 'Confirm',
      notNow: 'Not now',
      upgradeBody:
        '{plan} starts today with a fresh week of credits. You pay {amount} now, with your unused {current} time taken off. Then {price}.',
      downgradeBody:
        'You keep {current} until {date}. Then {plan} starts, at {price}.',
      trialBody:
        'Your trial goes on. {plan} starts when it ends, on {date}, at {price}.',
      keepTitle: 'Keep {plan}',
      keepBody: 'You stay on {plan}. The switch to {next} is cancelled.',
      startNow: 'Start my plan now',
      startNowTitle: 'Start {plan} now',
      startNowBody:
        'Your trial ends now and {plan} starts, with a fresh week of credits. You pay {amount} today.',
      priceMonth: '{amount} a month',
      priceYear: '{amount} a year',
      changeFailed: "Your plan didn't change",
      switchesOn: 'Switches to {plan} on {date} · ',
      keepPlan: 'Keep {plan}',
      extraCredits: 'Extra credits: {credits} · ',
      addCredits: 'Add credits',
      creditsNote:
        '{price} for {credits} credits, used after your weekly credits run out. Valid for 12 months.',
    },
  },
} as const
