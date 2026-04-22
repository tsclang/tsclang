#include "runtime.h"

typedef struct { double (*area)(void *self); } Shape_vtable;
typedef struct { void *self; const Shape_vtable *vtable; } Shape;

typedef struct { double r; } Circle;
typedef struct { double w; double h; } Rect;

static double Circle_area(void *_self) {
    Circle *self = (Circle *)_self;
    (void)self;
    return 3.14 * self->r * self->r;
}

static const Shape_vtable Circle_Shape_vtable = { .area = Circle_area };

static double Rect_area(void *_self) {
    Rect *self = (Rect *)_self;
    (void)self;
    return self->w * self->h;
}

static const Shape_vtable Rect_Shape_vtable = { .area = Rect_area };

int main(void) {
    TSC_INIT();
    Circle c = {0};
    c.r = 5.0;
    Shape shape = {.self = &c, .vtable = &Circle_Shape_vtable};
    double a;
    if (shape.vtable == &Circle_Shape_vtable) {
        double r = ((Circle*)shape.self)->r;
        a = 3.14 * r * r;
    }
    else if (shape.vtable == &Rect_Shape_vtable) {
        double w = ((Rect*)shape.self)->w;
        double h = ((Rect*)shape.self)->h;
        a = w * h;
    }
    else { a = 0.0; }
    printf("%g\n", a);
    return 0;
}

