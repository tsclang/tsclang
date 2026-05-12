#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t _obj_x = 10;
    const int32_t _obj_y = 0;
    const int32_t x = _obj_x;
    const int32_t y = (_obj_y != 0) ? _obj_y : 5;
    printf("%d\n", x);
    printf("%d\n", y);
    return 0;
}
