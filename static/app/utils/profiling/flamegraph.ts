import {trimPackage} from 'sentry/components/events/interfaces/frame/utils';
import type {FlamegraphFrame} from 'sentry/utils/profiling/flamegraphFrame';
import type {ProfilingFormatterUnit} from 'sentry/utils/profiling/units/units';

import {Profile} from './profile/profile';
import {SampledProfile} from './profile/sampledProfile';
import {makeFormatter, makeTimelineFormatter} from './units/units';
import {CallTreeNode} from './callTreeNode';
import {Frame} from './frame';
import {Rect} from './speedscope';

function sortByTotalWeight(a: CallTreeNode, b: CallTreeNode) {
  return b.totalWeight - a.totalWeight;
}

export function sortFlamegraphAlphabetically(a: CallTreeNode, b: CallTreeNode) {
  return (a.frame.name + a.frame.file).localeCompare(b.frame.name + b.frame.file);
}

function makeTreeSort(sortFn: (a: CallTreeNode, b: CallTreeNode) => number) {
  return (root: CallTreeNode) => {
    const queue: CallTreeNode[] = [root];

    while (queue.length > 0) {
      const next = queue.pop()!;

      next.children.sort(sortFn);

      for (const child of next.children) {
        queue.push(child);
      }
    }
  };
}

const alphabeticTreeSort = makeTreeSort(sortFlamegraphAlphabetically);
const leftHeavyTreeSort = makeTreeSort(sortByTotalWeight);

export class Flamegraph {
  profile: Profile;
  frames: readonly FlamegraphFrame[] = [];

  inverted = false;
  sort: 'left heavy' | 'alphabetical' | 'call order' = 'call order';

  depth = 0;
  configSpace: Rect = Rect.Empty();
  root: FlamegraphFrame = {
    key: -1,
    parent: null,
    frame: new Frame({...Frame.Root}),
    node: new CallTreeNode(new Frame({...Frame.Root}), null),
    depth: -1,
    start: 0,
    end: 0,
    children: [],
  };

  unit: ProfilingFormatterUnit;
  formatter: (value: number) => string;
  timelineFormatter: (value: number) => string;

  static Empty(): Flamegraph {
    return new Flamegraph(Profile.Empty, {
      inverted: false,
      sort: 'call order',
    });
  }

  static Example(): Flamegraph {
    return new Flamegraph(SampledProfile.Example, {
      inverted: false,
      sort: 'call order',
    });
  }

  static From(
    from: Flamegraph,
    {
      inverted = false,
      sort = 'call order',
    }: {
      inverted?: Flamegraph['inverted'];
      sort?: Flamegraph['sort'];
    }
  ): Flamegraph {
    return new Flamegraph(from.profile, {
      inverted,
      sort,
    });
  }

  constructor(
    profile: Profile,
    {
      inverted = false,
      sort = 'call order',
      configSpace,
    }: {
      configSpace?: Rect;
      inverted?: boolean;
      sort?: 'left heavy' | 'alphabetical' | 'call order';
    } = {}
  ) {
    this.inverted = inverted;
    this.sort = sort;

    // @TODO check if we can get rid of this profile reference
    this.profile = profile;

    // If a custom config space is provided, use it and draw the chart in it
    switch (this.sort) {
      case 'left heavy': {
        this.frames = this.buildSortedChart(profile, leftHeavyTreeSort);
        break;
      }
      case 'alphabetical':
        if (this.profile.type === 'flamechart') {
          throw new TypeError('Flamechart does not support alphabetical sorting');
        }
        this.frames = this.buildSortedChart(profile, alphabeticTreeSort);
        break;
      case 'call order':
        if (this.profile.type === 'flamegraph') {
          throw new TypeError('Flamegraph does not support call order sorting');
        }
        this.frames = this.buildCallOrderChart(profile);
        break;
      default:
        throw new TypeError(`Unknown flamechart sort type: ${this.sort}`);
    }

    this.unit = profile.unit;
    this.formatter = makeFormatter(profile.unit);
    this.timelineFormatter = makeTimelineFormatter(profile.unit);

    const weight = this.root.children.reduce(
      (acc, frame) => acc + frame.node.totalWeight,
      0
    );

    this.root.node.totalWeight += weight;
    this.root.node.aggregate_duration_ns = this.root.children.reduce(
      (acc, frame) => acc + frame.node.aggregate_duration_ns,
      0
    );
    this.root.end = this.root.start + weight;
    this.root.frame.totalWeight += weight;

    let width = 0;

    if (this.profile.type === 'flamegraph' && weight > 0) {
      width = weight;
    } else if (this.profile.duration > 0) {
      width = configSpace ? configSpace.width : this.profile.duration;
    } else {
      // If the profile duration is 0, set the flamegraph duration
      // to 1 second so we can render a placeholder grid
      width =
        this.profile.unit === 'nanoseconds'
          ? 1e9
          : this.profile.unit === 'microseconds'
            ? 1e6
            : this.profile.unit === 'milliseconds'
              ? 1e3
              : 1;
    }

    this.configSpace = new Rect(0, 0, width, this.depth);
  }

  buildCallOrderChart(profile: Profile): FlamegraphFrame[] {
    const frames: FlamegraphFrame[] = [];
    const stack: FlamegraphFrame[] = [];
    let idx = 0;

    const openFrame = (node: CallTreeNode, value: number) => {
      const parent = stack[stack.length - 1] ?? this.root;

      const frame: FlamegraphFrame = {
        key: idx,
        frame: node.frame,
        node,
        parent,
        children: [],
        depth: 0,
        start: value,
        end: value,
      };

      if (parent) {
        parent.children.push(frame);
      } else {
        this.root.children.push(frame);
      }

      stack.push(frame);
      idx++;
    };

    const closeFrame = (_: CallTreeNode, value: number) => {
      const stackTop = stack.pop();

      if (!stackTop) {
        // This is unreachable because the profile importing logic already checks this
        throw new Error('Unbalanced stack');
      }

      stackTop.end = value;
      stackTop.depth = stack.length;

      if (stackTop.end - stackTop.start === 0) {
        return;
      }

      frames.push(stackTop);
      this.depth = Math.max(stackTop.depth, this.depth);
    };

    profile.forEach(openFrame.bind(this), closeFrame.bind(this));
    return frames;
  }

  buildSortedChart(
    profile: Profile,
    sortFn: (tree: CallTreeNode) => void
  ): FlamegraphFrame[] {
    const frames: FlamegraphFrame[] = [];
    const stack: FlamegraphFrame[] = [];

    sortFn(profile.callTree);

    const virtualRoot: FlamegraphFrame = {
      key: -1,
      frame: CallTreeNode.Root.frame,
      node: CallTreeNode.Root,
      parent: null,
      children: [],
      depth: 0,
      start: 0,
      end: 0,
    };

    this.root = virtualRoot;
    let idx = 0;

    const unboundOpenFrame = (node: CallTreeNode, value: number) => {
      const parent = stack[stack.length - 1] ?? this.root;
      const frame: FlamegraphFrame = {
        key: idx,
        frame: node.frame,
        node,
        parent,
        children: [],
        depth: 0,
        start: value,
        end: value,
        profileIds: Array.from(profile.callTreeNodeProfileIdMap.get(node) || []),
      };

      if (parent) {
        parent.children.push(frame);
      } else {
        this.root.children.push(frame);
      }

      stack.push(frame);
      idx++;
    };

    const unboundCloseFrame = (_node: CallTreeNode, value: number) => {
      const stackTop = stack.pop();

      if (!stackTop) {
        throw new Error('Unbalanced stack');
      }

      stackTop.end = value;
      stackTop.depth = stack.length;

      // Dont draw 0 width frames
      if (stackTop.end - stackTop.start === 0) {
        return;
      }
      frames.push(stackTop);
      this.depth = Math.max(stackTop.depth, this.depth);
    };

    const openFrame = unboundOpenFrame.bind(this);
    const closeFrame = unboundCloseFrame.bind(this);

    function visit(node: CallTreeNode, start: number) {
      if (!node.frame.isRoot) {
        openFrame(node, start);
      }

      let childTime = 0;
      node.children.forEach(child => {
        visit(child, start + childTime);
        childTime += child.totalWeight;
      });

      if (!node.frame.isRoot) {
        closeFrame(node, start + node.totalWeight);
      }
    }

    visit.bind(this)(profile.callTree, 0);
    return frames;
  }

  findAllMatchingFramesBy(
    query: string,
    fields: Array<keyof FlamegraphFrame['frame']>
  ): FlamegraphFrame[] {
    const matches: FlamegraphFrame[] = [];
    if (!fields.length) {
      throw new Error('No fields provided');
    }

    if (fields.length === 1) {
      for (const item of this.frames) {
        if (item.frame[fields[0]!] === query) {
          matches.push(item);
        }
      }
      return matches;
    }

    for (const item of this.frames) {
      for (let j = fields.length; j--; ) {
        if (item.frame[fields[j]!] === query) {
          matches.push(item);
        }
      }
    }

    return matches;
  }

  findAllMatchingFrames(frameName?: string, framePackage?: string): FlamegraphFrame[] {
    framePackage = tryTrimPackage(framePackage);

    const matches: FlamegraphFrame[] = [];

    for (const item of this.frames) {
      if (
        item.frame.name === frameName &&
        // the framePackage can match either the package or the module
        // this is an artifact of how we previously used image
        (tryTrimPackage(item.frame.package) === framePackage ||
          item.frame.module === framePackage)
      ) {
        matches.push(item);
      }
    }

    return matches;
  }
}

function tryTrimPackage(pkg?: string): string | undefined {
  return pkg ? trimPackage(pkg) : pkg;
}
