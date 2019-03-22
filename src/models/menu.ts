import Authorized from '@/utils/Authorized';
import { Effect } from 'dva';
import isEqual from 'lodash/isEqual';
import memoizeOne from 'memoize-one';
import { Reducer } from 'redux';
import { formatMessage } from 'umi-plugin-locale';
import defaultSettings from '../../config/defaultSettings';

const { menu } = defaultSettings;
const { check } = Authorized;

// Conversion router to menu.
function formatter(data: any[], parentAuthority: string[], parentName: string): any[] {
  if (!data) {
    return undefined;
  }
  return data
    .map(item => {
      if (!item.name || !item.path) {
        return null;
      }

      let locale = 'menu';
      if (parentName && parentName !== '/') {
        locale = `${parentName}.${item.name}`;
      } else {
        locale = `menu.${item.name}`;
      }
      // if enableMenuLocale use item.name,
      // close menu international
      const name = menu.disableLocal
        ? item.name
        : formatMessage({ id: locale, defaultMessage: item.name });
      const result = {
        ...item,
        name,
        locale,
        authority: item.authority || parentAuthority,
      };
      if (item.routes) {
        const children = formatter(item.routes, item.authority, locale);
        // Reduce memory usage
        result.children = children;
      }
      delete result.routes;
      return result;
    })
    .filter(item => item);
}

const memoizeOneFormatter = memoizeOne(formatter, isEqual);

interface SubMenuItem {
  children: SubMenuItem[];
  hideChildrenInMenu?: boolean;
  hideInMenu?: boolean;
  name?: any;
  component: any;
  authority?: string[];
  path: string;
}
/**
 * get SubMenu or Item
 */
const getSubMenu: (item: SubMenuItem) => SubMenuItem = item => {
  // doc: add hideChildrenInMenu
  if (item.children && !item.hideChildrenInMenu && item.children.some(child => child.name)) {
    return {
      ...item,
      children: filterMenuData(item.children), // eslint-disable-line
    };
  }
  return item;
};

/**
 * filter menuData
 */
const filterMenuData: (menuData: SubMenuItem[]) => SubMenuItem[] = menuData => {
  if (!menuData) {
    return [];
  }
  return menuData
    .filter(item => item.name && !item.hideInMenu)
    .map(item => check(item.authority, getSubMenu(item)))
    .filter(item => item) as SubMenuItem[];
};
/**
 * 获取面包屑映射
 * @param SubMenuItem[] menuData 菜单配置
 */
const getBreadcrumbNameMap: (menuData: SubMenuItem[]) => object = menuData => {
  if (!menuData) {
    return {};
  }
  const routerMap = {};

  const flattenMenuData: (data: SubMenuItem[]) => void = data => {
    data.forEach(menuItem => {
      if (menuItem.children) {
        flattenMenuData(menuItem.children);
      }
      // Reduce memory usage
      routerMap[menuItem.path] = menuItem;
    });
  };
  flattenMenuData(menuData);
  return routerMap;
};

const memoizeOneGetBreadcrumbNameMap = memoizeOne(getBreadcrumbNameMap, isEqual);

export interface MenuModelState {
  menuData: any[];
  routerData: any[];
  breadcrumbNameMap: object;
}

export interface MenuModel {
  namespace: 'menu';
  state: MenuModelState;
  effects: {
    getMenuData: Effect;
  };
  reducers: {
    save: Reducer<any>;
  };
}
const MenuModel: MenuModel = {
  namespace: 'menu',

  state: {
    menuData: [],
    routerData: [],
    breadcrumbNameMap: {},
  },

  effects: {
    *getMenuData({ payload }, { put }) {
      const { routes, authority, path } = payload;
      const originalMenuData = memoizeOneFormatter(routes, authority, path);
      const menuData = filterMenuData(originalMenuData);
      const breadcrumbNameMap = memoizeOneGetBreadcrumbNameMap(originalMenuData);
      yield put({
        type: 'save',
        payload: { menuData, breadcrumbNameMap, routerData: routes },
      });
    },
  },

  reducers: {
    save(state, action) {
      return {
        ...state,
        ...action.payload,
      };
    },
  },
};

export default MenuModel;
