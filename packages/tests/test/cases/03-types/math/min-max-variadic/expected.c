#include "runtime.h"

int main(void) {
    TSC_INIT();
    double _min_0 = 3;
    if (1 < _min_0) _min_0 = 1;
    if (4 < _min_0) _min_0 = 4;
    if (1 < _min_0) _min_0 = 1;
    printf("%s\n", tsc_dtoa((double)(_min_0)));
    double _max_1 = 3;
    if (1 > _max_1) _max_1 = 1;
    if (4 > _max_1) _max_1 = 4;
    if (1 > _max_1) _max_1 = 1;
    printf("%s\n", tsc_dtoa((double)(_max_1)));
    printf("%s\n", tsc_dtoa((double)(5)));
    printf("%s\n", tsc_dtoa((double)(5)));
    double _min_2 = 3.0;
    if (1.0 < _min_2) _min_2 = 1.0;
    if (4.0 < _min_2) _min_2 = 4.0;
    printf("%s\n", tsc_dtoa((double)(_min_2)));
    double _max_3 = 3.0;
    if (1.0 > _max_3) _max_3 = 1.0;
    if (4.0 > _max_3) _max_3 = 4.0;
    printf("%s\n", tsc_dtoa((double)(_max_3)));
    return 0;
}
