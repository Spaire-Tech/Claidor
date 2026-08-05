'use client'

import CourseWizard from '@/components/Courses/CourseWizard'
import { schemas } from '@spaire/client'

// Course-only ("MasterClass builder") reposition: product creation routes
// straight into the course wizard. The generic digital-product flow
// (CreateProductSplitPage) and the product-type chooser (ProductTypeDialog)
// are hidden, not deleted — restore the `?type=` branching here to bring them
// back.
export default function Page({
  organization,
}: {
  organization: schemas['Organization']
}) {
  return <CourseWizard organization={organization} />
}
