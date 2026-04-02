#include "runtime.h"

typedef struct { void (*draw)(void *self); } Drawable_vtable;
typedef struct { void *self; const Drawable_vtable *vtable; } Drawable;

typedef struct { double radius; } Circle;

static void Circle_draw(void *_self) {
    Circle *self = (Circle *)_self;
    (void)self;
    printf("%s\n", "circle");
}

static const Drawable_vtable Circle_Drawable_vtable = { .draw = Circle_draw };

int main(void) {
    TSC_INIT();
    Circle c = {0};
    c.radius = 5.0;
    Circle_draw(&c);
    return 0;
}
