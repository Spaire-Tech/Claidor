export default function SupportedUseCases() {
  return (
    <div className="flex flex-col gap-y-4 text-sm">
      <div className="flex flex-col gap-y-2">
        <p className="font-medium">Supported Usecases</p>
        <p className=" text-sm text-gray-500">
          Masterclasses and online courses, including video lessons, chapters,
          previews, and downloadable course materials.
        </p>
      </div>

      <div className="flex flex-col gap-y-2">
        <p className="font-medium">Prohibited Usecases</p>
        <ul className=" space-y-1 text-sm text-gray-500">
          <li>• Physical goods or products requiring shipping</li>
          <li>• Human services (custom development, design and consultancy)</li>
          <li>• Marketplaces</li>
          <li>
            • Anything in our list of{' '}
            <a
              href="https://docs.spairehq.com/merchant-of-record/acceptable-use"
              className="text-blue-500 underline"
              target="_blank"
              rel="noreferrer"
            >
              prohibited products
            </a>
          </li>
        </ul>
      </div>

      <div className=" border-t border-gray-200 pt-4">
        <p className=" text-xs text-gray-500">
          Transactions that violate our policy will be canceled and refunded.
        </p>
      </div>
    </div>
  )
}
