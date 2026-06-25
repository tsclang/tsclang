#include "runtime.h"

int main(void) {
    TSC_INIT();
    double _obj_x = 10;
    double _obj_y = 20;
    double x = _obj_x;
    double y = _obj_y;
    double sum = 0.0;
    sum = x + y;
    printf("%s\n", tsc_dtoa((double)(sum)));
    return 0;
}
