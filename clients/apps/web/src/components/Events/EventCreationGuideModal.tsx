import Button from '@claidor/ui/components/atoms/Button'
import { Well } from '../Shared/Well'
import {
  SyntaxHighlighterClient,
  SyntaxHighlighterProvider,
} from '../SyntaxHighlighterShiki/SyntaxHighlighterClient'

export interface EventCreationGuideModalProps {
  hide: () => void
}

export const EventCreationGuideModal = ({
  hide,
}: EventCreationGuideModalProps) => {
  return (
    <SyntaxHighlighterProvider>
      <div className="flex flex-col gap-4 p-8">
        <h1 className="text-2xl">Event Ingestion</h1>
        <p>Events can only be created through the Simeon Ingestion API.</p>
        <Well className=" rounded-lg bg-gray-100 p-4 text-sm">
          <SyntaxHighlighterClient
            lang="typescript"
            code={`import { Claidor } from "@spaire/sdk";

const claidor = new Claidor({
  accessToken: process.env["CLAIDOR_ACCESS_TOKEN"] ?? "",
});

const result = await claidor.events.ingest({
  events: [
    {
      name: "<value>",
      customerId: "<value>",
      metadata: {
        myCustomProperty: "value",
      },
    },
  ],
});`}
          />
        </Well>
        <Button className="self-start" onClick={hide} variant="secondary">
          Close
        </Button>
      </div>
    </SyntaxHighlighterProvider>
  )
}
