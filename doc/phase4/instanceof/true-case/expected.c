#include "runtime.h"

typedef struct { double (*area)(void *self); } Shape_vtable;
typedef struct { void *self; const Shape_vtable *vtable; } Shape;

typedef struct { double radius; } Circle;

static double Circle_area(Circle *self) {
    return 3.14 * self->radius * self->radius;
}

int main(void) {
    TSC_INIT();
    Circle c = {0};
    c.radius = 1.0;
    if (1) {
        printf("is circle\n");
    }
    return 0;
}
