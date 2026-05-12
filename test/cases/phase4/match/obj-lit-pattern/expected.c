#include "runtime.h"

typedef struct { int32_t kind; double a; double b; } Shape;

int main(void) {
    TSC_INIT();
    const Shape shape = { .kind = 1, .a = 5.0, .b = 0.0 };
    double area;
    if (shape.kind == 1) {
        double a = shape.a;
        double b = shape.b;
        area = 3.14 * a * a;
    }
    else if (shape.kind == 2) {
        double a = shape.a;
        double b = shape.b;
        area = a * b;
    }
    else { area = 0.0; }
    printf("%g\n", area);
    return 0;
}

