# LLM Provider API Keys

Keeping student work safe starts with choosing the right provider and storing each key securely. This guide takes you through the two provider keys; they differ from the client keys in [`API_Key_Management.md`](API_Key_Management.md):

- `MISTRAL_API_KEY` authenticates requests to Mistral AI.
- `GEMINI_API_KEY` authenticates requests to Google Gemini.
- `API_KEYS` authenticates clients calling this service and is generated locally with `npm run generate:api-key`.

## Provider recommendation

**Start with Mistral.** Its models are cost-effective for this workload, and Mistral AI is a French company with its registered offices in Paris. An EU-established provider is subject to the GDPR and other European data-protection requirements, but location alone does not guarantee privacy. Mistral’s key operational advantage over Gemini is [Zero Data Retention (ZDR)](https://help.mistral.ai/en/articles/347612-can-i-activate-zero-data-retention-zdr) for supported stateless API calls: when active, Mistral does not retain those requests and responses.

> **Before the first real submission:** Please enable ZDR at the first opportunity. Do not process a real student submission through Mistral until pay-as-you-go is active, ZDR has been approved and verified in the Admin panel, and the separate training/improvement opt-out has been configured. ZDR is not automatic and is not a substitute for the opt-out.

Once those checks are complete, the provider side of the retention loop is in place: the institution’s Google Workspace is the system of record, this backend processes submissions transiently, and Mistral does not retain supported requests or responses. If ZDR is pending, use test data only or do not use the provider.

Gemini’s paid terms protect prompts and responses from being used to improve products, but still describe limited-period logging for abuse prevention and legal or regulatory disclosures, transient storage or caching in any country where Google or its agents operate, and no blanket guarantee of no human review. Verified Mistral ZDR is therefore a material safeguarding advantage for student-derived data.

## Mistral API key — recommended

### Create the key

1. Create or sign in to a [Mistral account](https://console.mistral.ai).
2. Open [Mistral Studio](https://console.mistral.ai).
3. Select **API Keys** in the left-hand navigation and choose **Create new key**.
4. Give the key a recognisable name, set an expiry date, and create it.
5. Copy the key immediately. Mistral shows the full key only once; if it is lost, create a replacement.

Mistral’s official [API-key quickstart](https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key) has the current instructions. Free mode enables API access without a credit card, but **ZDR is available only with pay-as-you-go**. Review [Mistral API pricing](https://mistral.ai/pricing/api/) before enabling billing.

### Enable ZDR before the first real submission

1. Enable [pay-as-you-go](https://admin.mistral.ai/plateforme/subscription) if the organisation is still in Free mode.
2. Immediately request [Zero Data Retention (ZDR)](https://help.mistral.ai/en/articles/347612-can-i-activate-zero-data-retention-zdr) through the Mistral Help Center. Explain the legitimate reason clearly; for example, that this repository is an educational assessment service and ZDR is required to protect students’ privacy.
3. In the Admin panel, open **Privacy** and disable the **Anonymous improvement data** setting. ZDR and the training opt-out are separate controls; configure both.
4. Confirm that ZDR appears as active in the Admin panel before using the service with real submissions.

**Do not skip step 4.** An account being on pay-as-you-go does not prove that ZDR is active. Treat an unapproved or unverified request as a stop condition for production student data.

In this project, Mistral approved the ZDR request within seconds after the support chatbot was given the [AssessmentBot repository](https://github.com/h-arnold/AssessmentBot-LLM-Service) and the reason: protecting students’ privacy. That is practical experience, not a guarantee. Mistral reviews each request and may approve or deny it at its discretion.

Mistral’s current guidance says ZDR applies to supported stateless endpoints, including `/v1/chat/completions`, but not to stateful products such as Agents, batch processing, Files, Vibe Work, or Chat. See the [ZDR guidance](https://help.mistral.ai/en/articles/347612-can-i-activate-zero-data-retention-zdr) and [API training opt-out guidance](https://help.mistral.ai/en/articles/455207-can-i-opt-out-of-my-input-or-output-data-being-used-for-training) for the current scope.

Mistral’s [Commercial Terms of Service](https://legal.mistral.ai/terms/commercial-terms-of-service#4-mistral-ai-use-of-customer-data-and-outputs), [Data Processing Addendum](https://legal.mistral.ai/terms/data-processing-addendum), and [Privacy Policy](https://legal.mistral.ai/terms/privacy-policy#5-how-long-do-we-keep-your-personal-data) are the relevant contractual and policy references. Review them with the organisation’s data-protection lead; this guide is not legal advice.

### Configure the service

Put the key in the deployment’s secret store or local `.env` file:

```env
MISTRAL_API_KEY=your_mistral_api_key_here
```

Both default models are `mistral-small-latest`, so `MISTRAL_API_KEY` is required by default. See the [environment configuration guide](../configuration/environment.md) for routing and secret-handling rules. Never commit the real key or place it in `API_KEYS`.

## Gemini API key — optional provider

### Create the key

1. Sign in to [Google AI Studio’s API-key page](https://aistudio.google.com/apikey) with a Google account.
2. Accept the applicable terms when prompted.
3. For a new user, AI Studio can create a default Google Cloud project and key. If using an existing project, import it into AI Studio.
4. Create or select the key and copy it to a secure secret store immediately.
5. For paid-service treatment, associate the Google Cloud project with an active Cloud Billing account. Google’s [Gemini API key documentation](https://ai.google.dev/gemini-api/docs/api-key) explains project import, key restrictions, rotation, and the current standard/auth-key transition.

Configure it as:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

The service requires this key only when a configured model routes to Gemini. A model beginning with a recognised Gemini prefix, such as `gemini-2.5-flash`, selects the Gemini provider; see the [environment configuration guide](../configuration/environment.md#model--provider-routing).

### Gemini privacy and contractual limitations

If you need Gemini, do not use its free quota or an unpaid Google AI Studio service for student-derived data. Under the current [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms#unpaid-services), Google may use submitted content and responses to provide, improve, and develop its products and machine-learning technologies. Human reviewers may also read, annotate, and process API input and output. Google explicitly says not to submit sensitive, confidential, or personal information to Unpaid Services.

For Paid Services, the exact [“How Google Uses Your Data” section](https://ai.google.dev/gemini-api/terms#data-use-paid) says Google does not use prompts or responses to improve its products and processes them under the [Google Data Processing Addendum](https://business.safety.google/processorterms/). It also says they are logged for a limited period for policy-violation detection and prevention and required legal or regulatory disclosures. They may be stored transiently or cached in any country where Google or its agents maintain facilities. The [Google APIs Terms of Service](https://developers.google.com/terms) also apply.

Do **not** describe paid Gemini API access as a guaranteed 30-day retention period or a blanket guarantee of no human review. The paid terms specify only a “limited period”. Google’s separate [abuse-monitoring guidance](https://ai.google.dev/gemini-api/docs/usage-policies) describes retention and authorised-employee review of flagged content. Re-check these official documents before relying on Gemini for personal or confidential data.

The current terms also say that only Paid Services may be used when API clients are made available to users in the European Economic Area, Switzerland, or the United Kingdom. They restrict API clients directed towards, or likely to be accessed by, people under 18. Because this service may process school-age students’ work, obtain a specific legal and contractual decision before selecting Gemini. Do not assume a Google Workspace for Education agreement applies to a standalone Gemini API key; confirm the contract with Google and the organisation.

## Final checklist

- Prefer Mistral and use the default `mistral-small-latest` model unless there is a documented reason to use Gemini.
- For Mistral, use pay-as-you-go, request ZDR at the first opportunity, disable API training, and verify that ZDR is active in the Admin panel before the first real submission.
- Only describe student data as being retained solely in the institution’s Google Workspace after verifying the frontend storage, backend logging, backups, and active ZDR controls end to end.
- Never send student-derived data through free or unpaid Gemini services.
- Review the provider’s current terms, data-processing agreement, retention policy, subprocessors, and regional-transfer arrangements before production use.
- Store provider keys in a secret manager or environment variable; never commit them, log them, or expose them to client-side code.
