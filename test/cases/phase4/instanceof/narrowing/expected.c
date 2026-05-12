#include "runtime.h"

typedef struct { double (*area)(void *self); } Shape_vtable;
typedef struct { void *self; const Shape_vtable *vtable; } Shape;

typedef struct { double radius; } Circle;
typedef struct { double w; double h; } Rect;

static double Circle_area(const Circle *self) {
    return 3.14 * self->radius * self->radius;
}

static double Rect_area(const Rect *self) {
    return self->w * self->h;
}

static const Shape_vtable _Circle_Shape_vtable = {
    .area = (double (*)(void *))Circle_area,
};

void describe_Shape(Shape s) {
    if (s.vtable == &_Circle_Shape_vtable) {
        printf("circle\n");
    } else {
        printf("rect\n");
    }
}

int main(void) {
    TSC_INIT();
    Circle c = {0};
    c.radius = 2.0;
    Shape _s_c = { .self = &c, .vtable = &_Circle_Shape_vtable };
    describe_Shape(_s_c);
    return 0;
}
