#include "runtime.h"

int main(void) {
    TSC_INIT();
    const double _obj_x = 10;
    const double _obj_y = 0;
    const double x = _obj_x;
    const double y = (_obj_y != 0) ? _obj_y : 5;
    printf("%g\n", x);
    printf("%g\n", y);
    return 0;
}
