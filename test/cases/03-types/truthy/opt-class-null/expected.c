#include "runtime.h"

typedef struct { int32_t x; int32_t y; } Point;
typedef struct { bool has_value; Point value; } opt_Point;

int main(void) {
    TSC_INIT();
    opt_Point p = {false, 0};
    if (p.has_value) {
        printf("yes\n");
    } else {
        printf("no\n");
    }
    return 0;
}
