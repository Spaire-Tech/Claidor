'use client'

// iPhone chrome for the course landing's phone canvas. The canvas renders
// INLINE (no iframe): the child is the real landing component wearing the
// mobile stylesheet via its `.gpp-m` class, so it loads instantly and the
// text renders at native resolution — nothing is ever bitmap-scaled.
//
// The screen is a fixed 430px logical width (iPhone Pro Max class — big
// and readable) and fills the available height; the page scrolls inside
// it like a phone. The screen is a SIZE CONTAINER: the mobile stylesheet's
// class variant uses container units (cqh/cqw) where the media variant
// uses viewport units, so "100svh heroes" fill the phone screen, not the
// browser window.

import type { ReactNode } from 'react'

const SCREEN_W = 430
const BEZEL = 11

export function CoursePhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="course-phone-holder">
      <div className="course-phone-frame" aria-label="Mobile preview (iPhone)">
        <div className="course-phone-frame__island" aria-hidden />
        <div className="course-phone-frame__screen">
          <div className="course-phone-frame__scroll">{children}</div>
        </div>
        <div className="course-phone-frame__home" aria-hidden />
      </div>
      <style jsx>{`
        .course-phone-holder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: stretch;
          justify-content: center;
          overflow: hidden;
        }
        .course-phone-frame {
          position: relative;
          width: ${SCREEN_W + BEZEL * 2}px;
          flex-shrink: 0;
          background: #0c0c14;
          border-radius: 56px;
          padding: ${BEZEL}px;
          box-shadow:
            0 30px 60px -20px rgba(12, 12, 20, 0.45),
            0 8px 20px -8px rgba(12, 12, 20, 0.3),
            inset 0 0 0 1.5px #2a2a35;
        }
        .course-phone-frame__island {
          position: absolute;
          left: 50%;
          top: 18px;
          transform: translateX(-50%);
          width: 110px;
          height: 30px;
          background: #0c0c14;
          border-radius: 999px;
          z-index: 2;
          pointer-events: none;
        }
        .course-phone-frame__home {
          position: absolute;
          left: 50%;
          bottom: 8px;
          transform: translateX(-50%);
          width: 130px;
          height: 4px;
          background: rgba(255, 255, 255, 0.55);
          border-radius: 2px;
          z-index: 2;
          pointer-events: none;
        }
        .course-phone-frame__screen {
          position: relative;
          width: ${SCREEN_W}px;
          height: 100%;
          background: white;
          border-radius: 46px;
          overflow: hidden;
          isolation: isolate;
          /* Size container: the mobile stylesheet's class variant sizes
             heroes with cqh/cqw against THIS box (the phone screen). */
          container-type: size;
        }
        .course-phone-frame__scroll {
          width: 100%;
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .course-phone-frame__scroll::-webkit-scrollbar {
          width: 0;
          height: 0;
        }
      `}</style>
    </div>
  )
}
