import styled from '@emotion/styled';
import {motion} from 'framer-motion';

import {space} from 'sentry/styles/space';
import testableTransition from 'sentry/utils/testableTransition';
import {isChonkTheme} from 'sentry/utils/theme/withChonk';

const StepHeading = styled((props: React.ComponentProps<typeof motion.h2>) => (
  <motion.h2
    variants={{
      initial: {clipPath: 'inset(0% 100% 0% 0%)', opacity: 1},
      animate: {clipPath: 'inset(0% 0% 0% 0%)', opacity: 1},
      exit: {opacity: 0},
    }}
    transition={testableTransition({
      duration: 0.3,
    })}
    {...props}
  />
))<{step: number}>`
  position: relative;
  display: inline-grid;
  grid-template-columns: max-content auto;
  gap: ${space(2)};
  align-items: center;
  font-size: 21px;

  &:before {
    content: '${p => p.step}';
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    background-color: ${p =>
      isChonkTheme(p.theme) ? p.theme.colors.chonk.yellow400 : p.theme.yellow300};
    border-radius: 50%;
    color: ${p => (isChonkTheme(p.theme) ? p.theme.colors.black : p.theme.textColor)};
    font-size: 1rem;
  }
`;

export default StepHeading;
